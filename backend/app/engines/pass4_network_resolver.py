from app.engines.pass4_network_mapper import Pass4NetworkMapper
import logging

logger = logging.getLogger(__name__)

# Circuit-breaker thresholds — adjust here without touching rule logic
SUBNET_INFERENCE_RESOURCE_LIMIT = 20
VPC_INFERENCE_RESOURCE_LIMIT = 30


class Pass4NetworkTopologyResolver:
    def __init__(self):
        pass

    def _edge(self, source, target, label, confidence, evidence_reason, matched_on, rule_name):
        evidence = {
            "source": "NETWORK_TOPOLOGY",
            "rule": rule_name,
            "confidence": confidence,
            "confidence_reason": evidence_reason,
            "matched_on": matched_on
        }
        return {
            "id": f"edge-{source[-10:]}-{target[-10:]}",
            "source": source,
            "target": target,
            "type": "animatedEdge",
            "label": label,
            "confidence": confidence,
            "evidence": [evidence]
        }

    def run_pass4(self, nodes):
        mapper = Pass4NetworkMapper(nodes)
        edges = []

        # ── Build id/raw_id → ARN lookup ────────────────────────────────────
        id_to_arn = {}
        for n in nodes:
            arn = n.get("resource_arn", "")
            raw_id = n.get("raw_id", "")
            if raw_id and arn:
                id_to_arn[raw_id] = arn

        # ── Build ALB target index ───────────────────────────────────────────
        # Each entry: target_key → [(alb_arn, tg_arn, target_type)]
        # target_key is instance-id (EC2) or IP address (ECS/IP)
        alb_targets = {}
        for n in nodes:
            if n.get("node", {}).get("data", {}).get("service") != "alb":
                continue
            alb_arn = n.get("resource_arn", "")
            metrics = n.get("node", {}).get("data", {}).get("metrics", {})
            for tg in metrics.get("targetGroups", []):
                tg_arn = tg.get("TargetGroupArn", "")
                target_type = tg.get("TargetType", "instance")  # instance | ip | lambda
                for t in tg.get("Targets", []):
                    tid = t.get("Id")
                    if tid:
                        if tid not in alb_targets:
                            alb_targets[tid] = []
                        alb_targets[tid].append((alb_arn, tg_arn, target_type))

        # ── Build SG ingress reference index ────────────────────────────────
        sg_ingress_refs = {}
        for sg_id, sg_data in mapper.sg_to_rules.items():
            sg_ingress_refs[sg_id] = []
            for rule in sg_data.get("ipPermissions", []):
                from_port = rule.get("fromPort")
                to_port = rule.get("toPort")
                is_wide = False
                if from_port is None and to_port is None:
                    is_wide = True
                elif from_port == 0 and to_port == 65535:
                    is_wide = True

                for pair in rule.get("userIdGroupPairs", []):
                    src_sg = pair.get("groupId")
                    if src_sg:
                        sg_ingress_refs[sg_id].append({
                            "sourceGroup": src_sg,
                            "port": f"{from_port}-{to_port}" if from_port is not None else "ALL",
                            "is_wide": is_wide
                        })

        # ── Build reverse lookups from resource_context ──────────────────────
        sg_to_arns = {}
        subnet_to_arns = {}
        vpc_to_arns = {}

        for arn, ctx in mapper.resource_context.items():
            for sg_id in ctx.get("security_group_ids", set()):
                sg_to_arns.setdefault(sg_id, []).append(arn)

            sub = ctx.get("subnet_id")
            if sub:
                subnet_to_arns.setdefault(sub, []).append(arn)

            vpc = ctx.get("vpc_id")
            if vpc:
                vpc_to_arns.setdefault(vpc, []).append(arn)

        # ── Emission helper ─────────────────────────────────────────────────
        emitted = {}

        def emit(source, target, label, confidence, reason, matched_on, rule):
            key1 = (source, target)
            key2 = (target, source)
            if rule in emitted.get(key1, set()) or rule in emitted.get(key2, set()):
                return
            edges.append(self._edge(source, target, label, confidence, reason, matched_on, rule))
            emitted.setdefault(key1, set()).add(rule)

        def _has_stronger_edge(a, b):
            return (a, b) in emitted or (b, a) in emitted

        # ── Rule 1: SG Ingress Reference (confidence 70 wide, 85 specific) ──
        for sg_b_id, arn_bs in sg_to_arns.items():
            for rule in sg_ingress_refs.get(sg_b_id, []):
                sg_a_id = rule["sourceGroup"]
                is_wide = rule["is_wide"]
                conf = 70 if is_wide else 85

                for arn_a in sg_to_arns.get(sg_a_id, []):
                    for arn_b in arn_bs:
                        if arn_a == arn_b:
                            continue
                        emit(
                            arn_a, arn_b, "network_inferred", conf,
                            f"Security group {sg_b_id} allows ingress from {sg_a_id} on port {rule['port']}",
                            {"sg_b": sg_b_id, "sg_a": sg_a_id, "port": rule['port']},
                            "sg_ingress_reference"
                        )

        # ── Rule 2: ALB Target Group (confidence 95) ─────────────────────────
        # Handles two target types:
        #   Case A — instance: match target id directly against node raw_id
        #   Case B — ip: resolve IP via ENI records in mapper to find ECS task ARN
        for target_key, albs in alb_targets.items():
            resolved_arn = None
            resolve_evidence = {}

            # Case A: instance ID → EC2 raw_id lookup
            if target_key in id_to_arn:
                resolved_arn = id_to_arn[target_key]
                resolve_evidence = {"target_type": "instance", "target_id": target_key}
            else:
                # Case B: IP address → ENI → ECS task ARN
                eni = mapper.eni_by_ip.get(target_key)
                if eni:
                    task_arn = eni.get("task_arn") or eni.get("attachment", {}).get("taskArn")
                    if task_arn and task_arn in mapper.node_by_arn:
                        resolved_arn = task_arn
                        resolve_evidence = {
                            "target_type": "ip",
                            "target_ip": target_key,
                            "resolved_eni": eni.get("networkInterfaceId"),
                            "resolved_task_arn": task_arn
                        }

            if not resolved_arn:
                continue  # Could not resolve — skip silently

            for alb_arn, tg_arn, target_type in albs:
                emit(
                    alb_arn, resolved_arn, "network_inferred", 95,
                    f"ALB {alb_arn} has target registered in target group {tg_arn}",
                    {**resolve_evidence, "alb_arn": alb_arn, "tg_arn": tg_arn},
                    "alb_target_group"
                )

        # ── Rule 3: CloudFront Origin (confidence 95) ─────────────────────────
        for cf_arn, domains in mapper.cloudfront_origins.items():
            for domain in domains:
                for node_b in nodes:
                    arn_b = node_b.get("resource_arn")
                    if not arn_b:
                        continue
                    b_service = node_b.get("node", {}).get("data", {}).get("service")
                    match = False
                    if b_service == "s3" and domain.startswith(node_b.get("resource_name", "")):
                        match = True
                    elif b_service == "alb":
                        dns = node_b.get("node", {}).get("data", {}).get("metrics", {}).get("DNSName", "")
                        if dns and dns.lower() == domain.lower():
                            match = True
                    elif b_service == "apigateway":
                        if f"{node_b.get('raw_id')}.execute-api" in domain:
                            match = True

                    if match:
                        emit(
                            cf_arn, arn_b, "network_inferred", 95,
                            f"CloudFront distribution {cf_arn.split('/')[-1]} has origin {domain} pointing to {arn_b}",
                            {"domain": domain, "cf_arn": cf_arn, "target_arn": arn_b},
                            "cloudfront_origin"
                        )

        # ── Rule 4: VPC Endpoint (confidence 80) ────────────────────────────
        # Emits Resource → VPC Endpoint node only.
        # Does NOT attempt to resolve which specific S3 bucket / DynamoDB table
        # the resource actually communicates with — that information is not
        # derivable from the endpoint configuration alone.
        for vpc_id, endpoints in mapper.vpc_endpoints.items():
            arns_in_vpc = vpc_to_arns.get(vpc_id, [])
            for ep in endpoints:
                ep_id = ep.get("vpcEndpointId")
                svc_name = ep.get("serviceName", "")
                ep_arn = ep.get("vpcEndpointArn")  # Present when collected via normalizer

                if not ep_id:
                    continue

                for arn_a in arns_in_vpc:
                    # Emit Resource → VPC Endpoint (not Resource → downstream bucket/table)
                    target = ep_arn if ep_arn else ep_id  # Use ARN if available, else endpoint ID
                    emit(
                        arn_a, target, "network_inferred", 80,
                        f"Resource {arn_a} in {vpc_id} has access to {svc_name} via VPC endpoint {ep_id}",
                        {"endpoint_id": ep_id, "vpc_id": vpc_id, "service_name": svc_name},
                        "vpc_endpoint"
                    )

        # ── Rule 5: Shared Subnet (confidence 45) ────────────────────────────
        # Circuit breaker: skip if subnet has > SUBNET_INFERENCE_RESOURCE_LIMIT resources
        for subnet_id, arns in subnet_to_arns.items():
            count = len(arns)
            if count > SUBNET_INFERENCE_RESOURCE_LIMIT:
                logger.warning(
                    f"Skipping shared subnet inference for {subnet_id}: "
                    f"{count} resources exceeds safety threshold of {SUBNET_INFERENCE_RESOURCE_LIMIT}"
                )
                continue
            for i, arn_a in enumerate(arns):
                for arn_b in arns[i + 1:]:
                    if _has_stronger_edge(arn_a, arn_b):
                        continue
                    emit(
                        arn_a, arn_b, "network_inferred", 45,
                        f"Resources share subnet {subnet_id}",
                        {"subnet_id": subnet_id},
                        "shared_subnet"
                    )

        # ── Rule 6: Same VPC (confidence 25) ────────────────────────────────
        # Circuit breaker: skip if VPC has > VPC_INFERENCE_RESOURCE_LIMIT resources
        for vpc_id, arns in vpc_to_arns.items():
            count = len(arns)
            if count > VPC_INFERENCE_RESOURCE_LIMIT:
                logger.warning(
                    f"Skipping same-VPC inference for {vpc_id}: "
                    f"{count} resources exceeds safety threshold of {VPC_INFERENCE_RESOURCE_LIMIT}"
                )
                continue
            for i, arn_a in enumerate(arns):
                for arn_b in arns[i + 1:]:
                    if _has_stronger_edge(arn_a, arn_b):
                        continue
                    emit(
                        arn_a, arn_b, "network_inferred", 25,
                        f"Resources share VPC {vpc_id}",
                        {"vpc_id": vpc_id},
                        "same_vpc"
                    )

        logger.info(f"Pass4NetworkTopologyResolver generated {len(edges)} edges")
        return edges


pass4_network_resolver = Pass4NetworkTopologyResolver()
