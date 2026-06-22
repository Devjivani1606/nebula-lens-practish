import logging
import boto3
from typing import List, Dict, Any, Set

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
                            apigw_arn, lam_arn, "invokes", 100, ["api_gateway_integration"]
                        ))

        # [100] SQS → Lambda (event source mapping stored on lambda node)
        for lam_arn, n in by_service.get("lambda", []):
            for esm in self._m(n).get("eventSourceMappings", []):
                src = esm.get("eventSourceArn") or esm.get("EventSourceArn", "")
                if src and src in node_by_arn:
                    edges.append(self._edge(
                        src, lam_arn, "triggers", 100, ["event_source_mapping"]
                    ))

        # [100] S3 → Lambda (bucket notification config)
        for s3_arn, n in by_service.get("s3", []):
            notif = self._m(n).get("notificationConfiguration", {})
            for cfg in notif.get("LambdaFunctionConfigurations", []):
                func_arn = self._strip_q(cfg.get("LambdaFunctionArn", ""))
                if func_arn and func_arn in node_by_arn:
                    edges.append(self._edge(
                        s3_arn, func_arn, "triggers", 100, ["s3_bucket_notification"]
                    ))

        # [100] EventBridge → Lambda / SQS (rule targets)
        for eb_arn, n in by_service.get("eventbridge", []):
            for tgt in self._m(n).get("targets", []):
                tgt_arn = self._strip_q(tgt.get("Arn") or tgt.get("arn", ""))
                if tgt_arn and tgt_arn in node_by_arn:
                    edges.append(self._edge(
                        eb_arn, tgt_arn, "triggers", 100, ["eventbridge_rule_target"]
                    ))

        # [100] SNS → Lambda / SQS (topic subscriptions stored on sns node)
        for sns_arn, n in by_service.get("sns", []):
            for endpoint_arn in self._m(n).get("subscriptionEndpoints", []):
                endpoint_arn = self._strip_q(endpoint_arn)
                if endpoint_arn and endpoint_arn in node_by_arn:
                    edges.append(self._edge(
                        sns_arn, endpoint_arn, "triggers", 100, ["sns_subscription"]
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
                            table_arn, lam_arn, "triggers", 100, ["dynamodb_stream_esm"]
                        ))

        # [90] CloudFront → S3 (origin domain name matches bucket)
        for cf_arn, n in by_service.get("cloudfront", []):
            for bucket_name in self._m(n).get("s3BucketNames", []):
                for s3_arn, _ in by_service.get("s3", []):
                    if bucket_name and s3_arn.endswith(f":::{bucket_name}"):
                        edges.append(self._edge(
                            cf_arn, s3_arn, "serves_from", 90, ["cloudfront_s3_origin"]
                        ))

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
                        ec2_arn, rds_arn, "writes_to", 70, ["security_group_rule"]
                    ))

        # ── Step 5: Deduplicate ──────────────────────────────────────────────
        seen: Set[tuple] = set()
        unique: List[dict] = []
        for e in edges:
            key = (e["source"], e["target"], e.get("label", ""))
            if key not in seen:
                seen.add(key)
                unique.append(e)

        logger.info(
            f"RelationshipEngine: {len(unique)} unique edges discovered "
            f"from {len(node_by_arn)} eligible nodes"
        )
        return unique

    # ── Private helpers ──────────────────────────────────────────────────────

    def _edge(
        self,
        source: str,
        target: str,
        label: str,
        confidence: int,
        evidence: List[str]
    ) -> dict:
        """Build a standard React Flow edge dict."""
        return {
            "id": f"edge-{source[-10:]}-{target[-10:]}",
            "source": source,
            "target": target,
            "type": "animatedEdge",
            "label": label,
            "confidence": confidence,
            "evidence": evidence
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
                        source_arn, tgt_arn, label, 80, ["iam_policy_permission"]
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
