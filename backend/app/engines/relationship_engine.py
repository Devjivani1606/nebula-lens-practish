import hashlib
import logging
import boto3
from typing import List, Dict, Any, Set
from dataclasses import dataclass
from app.engines.pass4_network_resolver import pass4_network_resolver

@dataclass
class RelationshipRule:
    source_service: str
    config_path: str
    target_type: str
    relationship_type: str
    confidence: float
    extractor: str

PASS_2_RULES = [
    RelationshipRule("lambda", "roleArn", "IAM Role", "USES", 95, "arn"),
    RelationshipRule("lambda", "vpcId", "VPC", "DEPLOYED_IN", 90, "id"),
    RelationshipRule("lambda", "subnetIds", "Subnet", "DEPLOYED_IN", 90, "id_list"),
    RelationshipRule("lambda", "securityGroupIds", "Security Group", "SECURED_BY", 90, "id_list"),
    RelationshipRule("lambda", "environment.Variables", "SQS Queue", "REFERENCES", 60, "env_heuristic"),
    RelationshipRule("lambda", "environment.Variables", "DynamoDB Table", "REFERENCES", 60, "env_heuristic"),
    RelationshipRule("lambda", "environment.Variables", "S3 Bucket", "REFERENCES", 60, "env_heuristic"),
    RelationshipRule("lambda", "environment.Variables", "SNS Topic", "REFERENCES", 60, "env_heuristic"),
    RelationshipRule("lambda", "environment.Variables", "EventBridge Bus", "REFERENCES", 60, "env_heuristic"),
    RelationshipRule("apigateway", "integrations", "Lambda", "INVOKES", 95, "arn_list"),
    RelationshipRule("apigateway", "vpcLinkId", "VPC Link", "USES", 90, "id"),
    RelationshipRule("eventbridge", "targets.Arn", "Lambda", "TRIGGERS", 95, "arn_list"),
    RelationshipRule("eventbridge", "targets.Arn", "SNS Topic", "TRIGGERS", 95, "arn_list"),
    RelationshipRule("eventbridge", "targets.Arn", "SQS Queue", "TRIGGERS", 95, "arn_list"),
    RelationshipRule("eventbridge", "targets.Arn", "Step Functions", "TRIGGERS", 95, "arn_list"),
    RelationshipRule("sns", "endpoints.Lambda", "Lambda", "NOTIFIES", 95, "arn_list"),
    RelationshipRule("sns", "endpoints.SQS", "SQS Queue", "NOTIFIES", 95, "arn_list"),
    RelationshipRule("alb", "targetGroups", "Target Group", "ROUTES_TO", 95, "arn_list"),
    RelationshipRule("alb", "targets", "EC2 Instance", "ROUTES_TO", 90, "id_list"),
    RelationshipRule("alb", "targets", "ECS Service", "ROUTES_TO", 90, "id_list"),
    RelationshipRule("ecs", "taskRoleArn", "IAM Role", "USES", 95, "arn"),
    RelationshipRule("ecs", "executionRoleArn", "IAM Role", "USES", 95, "arn"),
    RelationshipRule("ecs", "secrets", "Secrets Manager", "READS", 95, "arn_list"),
    RelationshipRule("ecs", "logGroup", "CloudWatch Logs", "WRITES_TO", 70, "name"),
    RelationshipRule("ecs", "images", "ECR Repo", "PULLS_FROM", 80, "name_list"),
    RelationshipRule("cloudfront", "origins", "S3 Bucket", "SERVES", 85, "domain_name"),
    RelationshipRule("cloudfront", "origins", "ALB", "SERVES", 85, "domain_name"),
    RelationshipRule("cloudfront", "origins", "API Gateway", "SERVES", 85, "domain_name"),
    RelationshipRule("rds", "dbSubnetGroupVpcId", "VPC", "DEPLOYED_IN", 90, "id"),
    RelationshipRule("rds", "subnets", "Subnet", "DEPLOYED_IN", 90, "id_list"),
    RelationshipRule("rds", "vpcSecurityGroups", "Security Group", "SECURED_BY", 90, "id_list"),
    RelationshipRule("stepfunctions", "states_resources.Lambda", "Lambda", "INVOKES", 95, "arn_list"),
    RelationshipRule("stepfunctions", "states_resources.SNS", "SNS Topic", "INVOKES", 95, "arn_list"),
    RelationshipRule("stepfunctions", "states_resources.SQS", "SQS Queue", "INVOKES", 95, "arn_list"),
    RelationshipRule("secretsmanager", "rotationLambdaARN", "Lambda", "ROTATED_BY", 95, "arn"),
    RelationshipRule("eks", "roleArn", "IAM Role", "USES", 95, "arn"),
    RelationshipRule("eks", "nodegroupArns", "Node Group", "CONTAINS", 95, "arn_list"),
    RelationshipRule("eks", "securityGroupIds", "Security Group", "SECURED_BY", 90, "id_list")
]

logger = logging.getLogger(__name__)


class RelationshipEngine:
    """
    Dynamically discovers communication edges between AWS resources.

    Rules
    ─────
    • VPC and Subnet are NEVER edge source/target — hierarchy via parentId only.
    • Supported edge services: ec2, lambda, s3, sqs, rds, apigateway, eventbridge

    Edge Matrix
    ───────────────────────────────────────────────────────────────────────────
    Source          Target          How                         Confidence
    ─────────────── ─────────────── ─────────────────────────── ──────────
    apigateway      lambda          Integration URI             100
    sqs             lambda          Event Source Mapping (ESM)  100
    s3              lambda          Bucket notification config   100
    eventbridge     lambda/sqs      Rule targets                100
    lambda          s3/sqs/rds      IAM execution role          80
    ec2             s3/sqs/rds      IAM instance profile role   80
    ec2             rds             Security group ingress rule  70
    """

    # Services that are hierarchy containers — NEVER appear as edge endpoints
    HIERARCHY_SERVICES = frozenset({"vpc", "subnet"})

    # Edge matrix updated:
    # SNS  → Lambda/SQS  (topic subscription)          100
    # DynamoDB → Lambda  (stream ESM on lambda)         100
    # CloudFront → S3    (origin domain match)          90
    # Lambda → DynamoDB  (IAM policy permission)        80
    # EC2    → DynamoDB  (IAM instance profile)         80

    def discover_relationships(
        self,
        credentials: dict,
        region_list: List[str],
        nodes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Main entry point. Accepts all scanned node results, returns edge list.
        All edge discovery is metadata-driven — no hardcoded ARNs.
        """
        # ── Step 1: Index all non-hierarchy nodes ────────────────────────────
        node_by_arn: Dict[str, Dict] = {}       # arn → node_result
        by_service: Dict[str, List] = {}        # service → [(arn, node_result)]
        vpc_nodes_raw: List[Dict] = []          # kept separately for SG data only

        for n in nodes:
            service = n.get("node", {}).get("data", {}).get("service", "")
            arn = n.get("resource_arn", "")
            if not arn:
                continue
            if service == "vpc":
                vpc_nodes_raw.append(n)
                continue
            if service in self.HIERARCHY_SERVICES:
                continue
            node_by_arn[arn] = n
            by_service.setdefault(service, []).append((arn, n))

        # Shared IAM cache — avoids repeated AWS calls for same role
        iam_cache: Dict[str, Dict[str, Set[str]]] = {}

        edges: List[dict] = []

        # ── Step 2: Confidence 100 detectors ────────────────────────────────

        # [100] APIGateway → Lambda (integration URI)
        for apigw_arn, n in by_service.get("apigateway", []):
            for uri in self._m(n).get("integrations", []):
                if not isinstance(uri, str):
                    continue
                if "/functions/" in uri and "/invocations" in uri:
                    raw = uri.split("/functions/")[1].split("/invocations")[0]
                    lam_arn = self._strip_q(raw)
                    if lam_arn in node_by_arn:
                        edges.append(self._edge(
                            apigw_arn, lam_arn, "invokes", 100, ["api_gateway_integration"], category="runtime"
                        ))

        # [100] SQS → Lambda (event source mapping stored on lambda node)
        for lam_arn, n in by_service.get("lambda", []):
            for esm in self._m(n).get("eventSourceMappings", []):
                src = esm.get("eventSourceArn") or esm.get("EventSourceArn", "")
                if src and src in node_by_arn:
                    edges.append(self._edge(
                        src, lam_arn, "triggers", 100, ["event_source_mapping"], category="runtime"
                    ))

        # [100] S3 → Lambda (bucket notification config)
        for s3_arn, n in by_service.get("s3", []):
            notif = self._m(n).get("notificationConfiguration", {})
            for cfg in notif.get("LambdaFunctionConfigurations", []):
                func_arn = self._strip_q(cfg.get("LambdaFunctionArn", ""))
                if func_arn and func_arn in node_by_arn:
                    edges.append(self._edge(
                        s3_arn, func_arn, "triggers", 100, ["s3_bucket_notification"], category="runtime"
                    ))

        # [100] EventBridge → Lambda / SQS (rule targets)
        for eb_arn, n in by_service.get("eventbridge", []):
            for tgt in self._m(n).get("targets", []):
                tgt_arn = self._strip_q(tgt.get("Arn") or tgt.get("arn", ""))
                if tgt_arn and tgt_arn in node_by_arn:
                    edges.append(self._edge(
                        eb_arn, tgt_arn, "triggers", 100, ["eventbridge_rule_target"], category="runtime"
                    ))

        # [100] SNS → Lambda / SQS (topic subscriptions stored on sns node)
        for sns_arn, n in by_service.get("sns", []):
            for endpoint_arn in self._m(n).get("subscriptionEndpoints", []):
                endpoint_arn = self._strip_q(endpoint_arn)
                if endpoint_arn and endpoint_arn in node_by_arn:
                    edges.append(self._edge(
                        sns_arn, endpoint_arn, "triggers", 100, ["sns_subscription"], category="runtime"
                    ))

        # [100] DynamoDB → Lambda (stream as event source mapping on lambda)
        for lam_arn, n in by_service.get("lambda", []):
            for esm in self._m(n).get("eventSourceMappings", []):
                src = esm.get("eventSourceArn") or esm.get("EventSourceArn", "")
                if src and ":dynamodb:" in src:
                    # ESM ARN is stream ARN — match to table ARN
                    table_arn = src.split("/stream/")[0] if "/stream/" in src else src
                    if table_arn in node_by_arn:
                        edges.append(self._edge(
                            table_arn, lam_arn, "triggers", 100, ["dynamodb_stream_esm"], category="runtime"
                        ))

        # [90] CloudFront → S3 (origin domain name matches bucket)
        for cf_arn, n in by_service.get("cloudfront", []):
            for bucket_name in self._m(n).get("s3BucketNames", []):
                for s3_arn, _ in by_service.get("s3", []):
                    if bucket_name and s3_arn.endswith(f":::{bucket_name}"):
                        edges.append(self._edge(
                            cf_arn, s3_arn, "serves_from", 90, ["cloudfront_s3_origin"], category="runtime"
                        ))
        # ── Step 2.5: Confidence engine — Pass 2 (Configuration Rules) ────────
        edges.extend(self._run_pass2_rules(node_by_arn, by_service, vpc_nodes_raw))

        # ── Step 3: Confidence 80 — IAM role policies ────────────────────────

        # [80] Lambda → S3 / SQS / RDS
        for lam_arn, n in by_service.get("lambda", []):
            role_arn = self._m(n).get("roleArn", "")
            if role_arn:
                allowed = self._iam_allowed(credentials, role_arn, iam_cache)
                edges += self._iam_edges(lam_arn, allowed, by_service)

        # [80] EC2 → S3 / SQS / RDS (via instance profile → role)
        for ec2_arn, n in by_service.get("ec2", []):
            profile_arn = self._m(n).get("iamInstanceProfileArn", "")
            if profile_arn:
                role_arn = self._role_from_profile(credentials, profile_arn)
                if role_arn:
                    allowed = self._iam_allowed(credentials, role_arn, iam_cache)
                    edges += self._iam_edges(ec2_arn, allowed, by_service)

        # ── Step 4: Confidence 70 — Security group overlap ───────────────────

        # Build sg_id → ingress rules from VPC node metrics
        sg_ingress: Dict[str, List[dict]] = {}
        for vpc_n in vpc_nodes_raw:
            sgs = vpc_n.get("node", {}).get("data", {}).get("metrics", {}).get("securityGroups", [])
            for sg in sgs:
                sg_id = sg.get("groupId")
                if not sg_id:
                    continue
                rules = []
                for perm in sg.get("ipPermissions", []):
                    for pair in perm.get("userIdGroupPairs", []):
                        src_sg = pair.get("groupId")
                        if src_sg:
                            rules.append({
                                "fromPort": perm.get("fromPort"),
                                "toPort": perm.get("toPort"),
                                "sourceGroup": src_sg
                            })
                sg_ingress[sg_id] = rules

        # [70] EC2 → RDS via SG ingress match
        for ec2_arn, ec2_n in by_service.get("ec2", []):
            ec2_sgs = set(self._m(ec2_n).get("securityGroupIds", []))
            if not ec2_sgs:
                continue
            for rds_arn, rds_n in by_service.get("rds", []):
                vpc_sgs = rds_n.get("node", {}).get("data", {}).get("VpcSecurityGroups", [])
                rds_sg_ids = [
                    sg.get("VpcSecurityGroupId")
                    for sg in vpc_sgs
                    if sg.get("VpcSecurityGroupId")
                ]
                connected = False
                for rds_sg in rds_sg_ids:
                    for rule in sg_ingress.get(rds_sg, []):
                        if rule.get("sourceGroup") in ec2_sgs:
                            connected = True
                            break
                    if connected:
                        break
                if connected:
                    edges.append(self._edge(
                        ec2_arn, rds_arn, "writes_to", 70, ["security_group_rule"], category="network"
                    ))

        # ── Step 4.5: Pass 4 Network Topology Inference ───────────────────────
        try:
            pass4_edges = pass4_network_resolver.run_pass4(nodes)
            edges.extend(pass4_edges)
        except Exception as e:
            logger.error(f"Pass 4 Network Topology Resolver failed: {e}")

        # ── Step 5: Deduplicate ──────────────────────────────────────────────
        unique_map: Dict[tuple, dict] = {}
        category_priority = {"runtime": 4, "network": 3, "inferred": 2, "iam_permission": 1}
        for e in edges:
            e_data = e.get("data", e)
            label = e_data.get("label", e.get("label", ""))
            key = (e["source"], e["target"], label)

            if key not in unique_map:
                e_copy = e.copy()
                # Ensure data dict exists for deep copy semantics on evidence
                if "data" in e:
                    e_copy["data"] = e["data"].copy()
                
                e_copy_data = e_copy.get("data", e_copy)
                if not isinstance(e_copy_data.get("evidence"), list):
                    e_copy_data["evidence"] = [e_copy_data.get("evidence")] if e_copy_data.get("evidence") else []
                unique_map[key] = e_copy
            else:
                existing = unique_map[key]
                existing_data = existing.get("data", existing)

                new_ev = e_data.get("evidence")
                if isinstance(new_ev, list):
                    existing_data["evidence"].extend(new_ev)
                elif new_ev:
                    existing_data["evidence"].append(new_ev)

                if e_data.get("confidence", 0) > existing_data.get("confidence", 0):
                    existing_data["confidence"] = e_data.get("confidence", 0)

                # Only promote category when the incoming edge has strictly
                # higher priority.  Use "" (→ priority 0) as the fallback so
                # that an edge with a missing/unknown category never silently
                # overwrites a correctly-set one (e.g. iam_permission → runtime).
                e_cat = e_data.get("category", "")
                ex_cat = existing_data.get("category", "")
                if category_priority.get(e_cat, 0) > category_priority.get(ex_cat, 0):
                    existing_data["category"] = e_cat

        unique = list(unique_map.values())

        logger.info(
            f"RelationshipEngine: {len(unique)} unique edges discovered "
            f"from {len(node_by_arn)} eligible nodes"
        )
        return unique

    # ── Private helpers ──────────────────────────────────────────────────────

    def _run_pass2_rules(self, node_by_arn: dict, by_service: dict, vpc_nodes_raw: list) -> list:
        edges = []
        for rule in PASS_2_RULES:
            for source_arn, n in by_service.get(rule.source_service, []):
                metrics = self._m(n)
                values = self._evaluate_path(metrics, rule.config_path)
                if not values: continue
                targets = self._run_extractor(rule.extractor, values, rule.target_type, node_by_arn, by_service, vpc_nodes_raw)
                for tgt, matched_val in targets:
                    evidence = {
                        "source": "CONFIG_ANALYSIS",
                        "rule_id": f"{rule.source_service}_{rule.target_type.replace(' ', '')}_{rule.relationship_type}",
                        "confidence": rule.confidence,
                        "extractor": rule.extractor,
                        "matched_value": matched_val
                    }
                    edges.append(self._edge(
                        source_arn, tgt, rule.relationship_type.lower(), rule.confidence, evidence
                    ))
        return edges

    def _evaluate_path(self, metrics: dict, path: str) -> list:
        res = []
        if path == "roleArn": return [metrics.get("roleArn")]
        if path == "vpcId": return [metrics.get("vpcId")]
        if path == "subnetIds": return metrics.get("subnetIds", [])
        if path == "securityGroupIds": return metrics.get("securityGroupIds", [])
        if path == "environment.Variables": return list(metrics.get("environment", {}).get("Variables", {}).values())
        if path == "integrations": return metrics.get("integrations", [])
        if path == "vpcLinkId": return [metrics.get("vpcLinkId")]
        if path == "targets.Arn": return [t.get("Arn", t.get("arn")) for t in metrics.get("targets", [])]
        if path == "endpoints.Lambda": return metrics.get("endpoints", {}).get("Lambda", [])
        if path == "endpoints.SQS": return metrics.get("endpoints", {}).get("SQS", [])
        if path == "targetGroups": return [tg.get("TargetGroupArn") for tg in metrics.get("targetGroups", [])]
        if path == "targets":
            for tg in metrics.get("targetGroups", []):
                for tgt in tg.get("Targets", []): res.append(tgt.get("Id"))
            return res
        if path == "taskRoleArn": return [metrics.get("taskRoleArn")]
        if path == "executionRoleArn": return [metrics.get("executionRoleArn")]
        if path == "secrets":
            for sec in metrics.get("secrets", []): res.append(sec.get("ValueFrom"))
            return res
        if path == "logGroup": return [metrics.get("logGroup")]
        if path == "images": return metrics.get("images", [])
        if path == "origins": return [o.get("DomainName") for o in metrics.get("origins", [])]
        if path == "dbSubnetGroupVpcId": return [metrics.get("dbSubnetGroupVpcId")]
        if path == "subnets": return metrics.get("subnets", [])
        if path == "vpcSecurityGroups": return metrics.get("vpcSecurityGroups", [])
        if path == "states_resources.Lambda":
            for s in metrics.get("states", {}).values():
                if s.get("Type") == "Task" and "lambda" in str(s.get("Resource", "")).lower(): res.append(s.get("Resource"))
            return res
        if path == "states_resources.SNS":
            for s in metrics.get("states", {}).values():
                if s.get("Type") == "Task" and "sns" in str(s.get("Resource", "")).lower(): res.append(s.get("Resource"))
            return res
        if path == "states_resources.SQS":
            for s in metrics.get("states", {}).values():
                if s.get("Type") == "Task" and "sqs" in str(s.get("Resource", "")).lower(): res.append(s.get("Resource"))
            return res
        if path == "rotationLambdaARN": return [metrics.get("rotationLambdaARN")]
        if path == "nodegroupArns": return metrics.get("nodegroupArns", [])
        return [r for r in res if r]

    def _run_extractor(self, extractor: str, values: list, target_type: str, node_by_arn: dict, by_service: dict, vpc_nodes_raw: list) -> list:
        targets = []
        if extractor in ["arn", "arn_list"]:
            for v in values:
                if not v: continue
                stripped = self._strip_q(v)
                if stripped in node_by_arn: targets.append((stripped, v))
        elif extractor in ["id", "id_list"]:
            for v in values:
                if not v: continue
                for arn, n in node_by_arn.items():
                    if n.get("raw_id") == v or v in arn: targets.append((arn, v))
                for vpc_n in vpc_nodes_raw:
                    if vpc_n.get("raw_id") == v or v in vpc_n.get("resource_arn", ""): targets.append((vpc_n.get("resource_arn"), v))
                    sgs = vpc_n.get("node", {}).get("data", {}).get("metrics", {}).get("securityGroups", [])
                    for sg in sgs:
                        if sg.get("groupId") == v: targets.append((vpc_n.get("resource_arn"), v))
        elif extractor in ["name", "name_list"]:
            for v in values:
                if not v: continue
                for arn, n in node_by_arn.items():
                    if n.get("resource_name") == v or v in arn: targets.append((arn, v))
        elif extractor == "domain_name":
            for v in values:
                if not v or not isinstance(v, str) or len(v) < 10: continue
                v_lower = v.lower()
                if target_type == "S3 Bucket" and ".s3." in v_lower:
                    bucket_name = v_lower.split(".s3.")[0]
                    for arn, n in by_service.get("s3", []):
                        if n.get("resource_name", "").lower() == bucket_name:
                            targets.append((arn, v))
                elif target_type == "ALB" and ".elb.amazonaws.com" in v_lower:
                    dns_prefix = v_lower.split(".elb.amazonaws.com")[0]
                    for arn, n in by_service.get("alb", []):
                        alb_dns = n.get("node", {}).get("data", {}).get("metrics", {}).get("DNSName", "").lower()
                        if dns_prefix and alb_dns.startswith(dns_prefix):
                            targets.append((arn, v))
                elif target_type == "API Gateway" and ".execute-api." in v_lower:
                    api_id = v_lower.split(".execute-api.")[0]
                    for arn, n in by_service.get("apigateway", []):
                        if n.get("raw_id", "").lower() == api_id:
                            targets.append((arn, v))
        elif extractor == "env_heuristic":
            for v in values:
                if not v or not isinstance(v, str) or len(v) < 10: continue
                v_lower = v.lower()
                if target_type == "SQS Queue" and v_lower.startswith("https://sqs.") and ".amazonaws.com/" in v_lower:
                    for arn, n in by_service.get("sqs", []):
                        q_name = n.get("resource_name", "")
                        if q_name and v_lower.endswith("/" + q_name.lower()):
                            targets.append((arn, v))
                elif target_type == "SNS Topic" and v_lower.startswith("arn:aws:sns:"):
                    for arn, n in by_service.get("sns", []):
                        if v_lower == arn.lower(): targets.append((arn, v))
                elif target_type == "S3 Bucket" and (v_lower.startswith("arn:aws:s3:::") or v_lower.startswith("s3://")):
                    for arn, n in by_service.get("s3", []):
                        b_name = n.get("resource_name", "")
                        if b_name and (v_lower == f"arn:aws:s3:::{b_name}".lower() or v_lower == f"s3://{b_name}".lower() or v_lower.startswith(f"s3://{b_name}/".lower())):
                            targets.append((arn, v))
                elif target_type == "DynamoDB Table" and v_lower.startswith("arn:aws:dynamodb:"):
                    for arn, n in by_service.get("dynamodb", []):
                        if v_lower == arn.lower() or v_lower.startswith(f"{arn.lower()}/"):
                            targets.append((arn, v))
                elif target_type == "EventBridge Bus" and (v_lower.startswith("arn:aws:events:") or ("/" not in v_lower)):
                    for arn, n in by_service.get("eventbridge", []):
                        bus_name = n.get("resource_name", "")
                        if bus_name and (v_lower == arn.lower() or v_lower == bus_name.lower()):
                            targets.append((arn, v))

        unique_targets = list(set(targets))
        return unique_targets

    def _edge(
        self,
        source: str,
        target: str,
        label: str,
        confidence: int,
        evidence: Any,
        category: str = "runtime"
    ) -> dict:
        unique = f"{source}-{target}-{label}"
        edge_id = "edge-" + hashlib.md5(unique.encode()).hexdigest()[:16]
        return {
            "id": edge_id,
            "source": source,
            "target": target,
            "type": "animatedEdge",
            "data": {
                "label": label,
                "confidence": confidence,
                "evidence": evidence,
                "category": category
            }
        }

    def _m(self, node_result: dict) -> dict:
        """Extract metrics dict from a node_result."""
        return node_result.get("node", {}).get("data", {}).get("metrics", {})

    def _strip_q(self, arn: str) -> str:
        """Strip Lambda version/alias qualifier — keep base 7-part ARN."""
        if not arn:
            return arn
        parts = arn.split(":")
        return ":".join(parts[:7]) if len(parts) > 7 else arn

    def _iam_edges(
        self,
        source_arn: str,
        allowed: Dict[str, Set[str]],
        by_service: Dict[str, List]
    ) -> List[dict]:
        """
        Emit IAM-permission-based edges from source to all matching
        S3 / SQS / RDS / DynamoDB nodes.
        """
        edges = []
        targets = [
            ("s3",        "writes_to"),
            ("sqs",       "sends_to"),
            ("rds",       "writes_to"),
            ("dynamodb",  "writes_to"),
        ]
        for svc, label in targets:
            permitted = allowed.get(svc, set())
            for tgt_arn, _ in by_service.get(svc, []):
                if self._arn_ok(tgt_arn, permitted):
                    edges.append(self._edge(
                        source_arn, tgt_arn, label, 80, ["iam_policy_permission"], category="iam_permission"
                    ))
        return edges

    def _arn_ok(self, arn: str, patterns: Set[str]) -> bool:
        """Check if ARN satisfies any IAM resource pattern (supports trailing *)."""
        for p in patterns:
            if p == "*":
                return True
            if p.endswith("*") and arn.startswith(p[:-1]):
                return True
            if arn == p:
                return True
        return False

    def _role_from_profile(self, credentials: dict, profile_arn: str) -> str:
        """Resolve EC2 IAM Instance Profile ARN → Role ARN via AWS IAM API."""
        try:
            iam = boto3.client(
                "iam",
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials["SessionToken"]
            )
            name = profile_arn.split("/")[-1]
            res = iam.get_instance_profile(InstanceProfileName=name)
            roles = res["InstanceProfile"].get("Roles", [])
            return roles[0]["Arn"] if roles else None
        except Exception:
            return None

    def _iam_allowed(
        self,
        credentials: dict,
        role_arn: str,
        cache: Dict[str, Dict[str, Set[str]]]
    ) -> Dict[str, Set[str]]:
        """
        Fetch and parse IAM role policies to determine which S3/SQS/RDS
        resources the role is allowed to access.
        Results are cached per role ARN to avoid repeated API calls.
        """
        if role_arn in cache:
            return cache[role_arn]

        allowed: Dict[str, Set[str]] = {"s3": set(), "sqs": set(), "rds": set(), "dynamodb": set()}
        try:
            role_name = role_arn.split("/")[-1]
            iam = boto3.client(
                "iam",
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials["SessionToken"]
            )
            # 1. Inline policies
            try:
                for pname in iam.list_role_policies(RoleName=role_name).get("PolicyNames", []):
                    try:
                        doc = iam.get_role_policy(
                            RoleName=role_name, PolicyName=pname
                        ).get("PolicyDocument", {})
                        self._parse_policy(doc, allowed)
                    except Exception:
                        pass
            except Exception:
                pass
            # 2. Managed (attached) policies
            try:
                for pol in iam.list_attached_role_policies(
                    RoleName=role_name
                ).get("AttachedPolicies", []):
                    try:
                        pol_arn = pol["PolicyArn"]
                        ver_id = iam.get_policy(PolicyArn=pol_arn)["Policy"]["DefaultVersionId"]
                        doc = iam.get_policy_version(
                            PolicyArn=pol_arn, VersionId=ver_id
                        )["PolicyVersion"]["Document"]
                        self._parse_policy(doc, allowed)
                    except Exception:
                        pass
            except Exception:
                pass
        except Exception as exc:
            logger.warning(f"IAM lookup failed for {role_arn}: {exc}")

        cache[role_arn] = allowed
        return allowed

    def _parse_policy(self, doc: dict, allowed: Dict[str, Set[str]]):
        """
        Parse an IAM policy document and populate `allowed` with
        resource ARNs that are explicitly Allowed.
        Handles both list and dict forms of Statement.
        """
        stmts = doc.get("Statement", [])
        if isinstance(stmts, dict):
            stmts = [stmts]

        for stmt in stmts:
            if stmt.get("Effect") != "Allow":
                continue

            actions = stmt.get("Action", [])
            if isinstance(actions, str):
                actions = [actions]

            resources = stmt.get("Resource", [])
            if isinstance(resources, str):
                resources = [resources]

            for action in actions:
                if not isinstance(action, str):
                    continue
                al = action.lower()

                for res in resources:
                    if not isinstance(res, str):
                        continue

                    # Wildcard resource '*' → allow all of matching service
                    if res == "*":
                        if "s3" in al:
                            allowed["s3"].add("*")
                        if "sqs" in al:
                            allowed["sqs"].add("*")
                        if "rds" in al:
                            allowed["rds"].add("*")
                        if "dynamodb" in al:
                            allowed["dynamodb"].add("*")
                        continue

                    if "s3" in al:
                        bucket = res.split("/*")[0].split("/")[0]
                        allowed["s3"].add(bucket)
                    elif "sqs" in al:
                        allowed["sqs"].add(res)
                    elif "rds" in al:
                        allowed["rds"].add(res)
                    elif "dynamodb" in al:
                        allowed["dynamodb"].add(res)


relationship_engine = RelationshipEngine()
