import logging

logger = logging.getLogger(__name__)


class Pass4NetworkMapper:
    """
    Builds a single mapping layer resolving each resource ARN
    to its network context (VPC, Subnet, Security Groups, ENIs).
    Computed once at construction and cached — never recomputed per rule.
    """

    def __init__(self, nodes: list):
        self.nodes = nodes
        self.node_by_arn = {n.get("resource_arn", ""): n for n in nodes if n.get("resource_arn")}

        # ARN → {security_group_ids: set, subnet_id: str|None, vpc_id: str|None}
        self.resource_context = {}

        # CloudFront ARN → list of origin domain strings
        self.cloudfront_origins = {}

        # sg_id → raw SG dict (including ipPermissions)
        self.sg_to_rules = {}

        # vpc_id → list of endpoint dicts
        self.vpc_endpoints = {}

        # instance-id → ENI dict  (used for EC2 ENI fallback)
        self.eni_by_attachment = {}

        # private IP → ENI dict  (used for ECS/IP target resolution in Rule 2)
        self.eni_by_ip = {}

        self._build()

    # ─────────────────────────────────────────────────────────────────────────
    def _build(self):
        # Pass 1 — extract global structures from VPC nodes
        for n in self.nodes:
            service = n.get("node", {}).get("data", {}).get("service")
            metrics = n.get("node", {}).get("data", {}).get("metrics", {})
            if service != "vpc":
                continue

            vpc_id = n.get("raw_id")
            for sg in metrics.get("securityGroups", []):
                self.sg_to_rules[sg.get("groupId")] = sg
            for ep in metrics.get("endpoints", []):
                self.vpc_endpoints.setdefault(vpc_id, []).append(ep)
            for eni in metrics.get("enis", []):
                att = eni.get("attachment") or {}
                # Index by EC2 instance ID
                if att.get("instanceId"):
                    self.eni_by_attachment[att["instanceId"]] = eni
                # Index by every private IP on the ENI
                for pa in eni.get("privateIpAddresses", []):
                    ip = pa.get("privateIpAddress")
                    if ip:
                        self.eni_by_ip[ip] = eni
                # Also index by the primary private IP if stored directly
                primary_ip = eni.get("privateIpAddress")
                if primary_ip:
                    self.eni_by_ip[primary_ip] = eni

        # Pass 2 — build per-resource network context
        for n in self.nodes:
            arn = n.get("resource_arn", "")
            if not arn:
                continue

            service = n.get("node", {}).get("data", {}).get("service")
            metrics = n.get("node", {}).get("data", {}).get("metrics", {})
            raw_id = n.get("raw_id", "")

            ctx = {"security_group_ids": set(), "subnet_id": None, "vpc_id": None}

            if service == "ec2":
                ctx["security_group_ids"] = set(metrics.get("securityGroupIds", []))
                ctx["subnet_id"] = metrics.get("subnetId")
                ctx["vpc_id"] = metrics.get("vpcId")

            elif service == "lambda":
                ctx["security_group_ids"] = set(metrics.get("securityGroupIds", []))
                ctx["vpc_id"] = metrics.get("vpcId")
                subnet_ids = metrics.get("subnetIds") or []
                if subnet_ids:
                    ctx["subnet_id"] = subnet_ids[0]

            elif service == "ecs":
                # ECS task definitions do not carry VPC / SG directly.
                # Resolve via ENI using the task ARN or cluster ENI records.
                # First try subnetIds if ECS cluster node exposes them.
                subnet_ids = metrics.get("subnetIds") or []
                if subnet_ids:
                    ctx["subnet_id"] = subnet_ids[0]
                # ENI fallback — look up by raw_id (task ARN) or arn
                eni = self.eni_by_attachment.get(raw_id) or self.eni_by_attachment.get(arn)
                if eni:
                    if not ctx["subnet_id"]:
                        ctx["subnet_id"] = eni.get("subnetId")
                    ctx["vpc_id"] = eni.get("vpcId")
                    ctx["security_group_ids"] = set(eni.get("securityGroupIds", []))
                elif not ctx["vpc_id"]:
                    logger.warning(f"Pass4: No ENI found for ECS task {arn}; network context will be empty")

            elif service == "rds":
                ctx["vpc_id"] = metrics.get("dbSubnetGroupVpcId")
                ctx["security_group_ids"] = {
                    sg.get("VpcSecurityGroupId")
                    for sg in metrics.get("vpcSecurityGroups", [])
                    if sg.get("VpcSecurityGroupId")
                }
                subnets = metrics.get("subnets") or []
                if subnets:
                    ctx["subnet_id"] = subnets[0].get("SubnetIdentifier") if isinstance(subnets[0], dict) else subnets[0]

            elif service == "elasticache":
                # ElastiCache exposes security groups and subnet group directly
                ctx["security_group_ids"] = {
                    sg.get("SecurityGroupId")
                    for sg in metrics.get("SecurityGroups", [])
                    if sg.get("SecurityGroupId")
                }
                # Subnet group — resolve to a concrete subnet_id if available
                subnet_group = metrics.get("CacheSubnetGroupName") or metrics.get("cacheSubnetGroupName")
                # If the normalizer stores resolved subnet IDs, use the first one
                subnet_ids = metrics.get("subnetIds") or []
                if subnet_ids:
                    ctx["subnet_id"] = subnet_ids[0]
                ctx["vpc_id"] = metrics.get("vpcId")
                if not ctx["vpc_id"] and not ctx["subnet_id"] and not ctx["security_group_ids"]:
                    logger.warning(f"Pass4: ElastiCache node {arn} has no resolvable network context")

            elif service == "alb":
                ctx["vpc_id"] = metrics.get("vpcId")
                ctx["security_group_ids"] = set(metrics.get("securityGroups", []))
                subnets = metrics.get("subnets") or []
                if subnets:
                    ctx["subnet_id"] = subnets[0]

            elif service == "cloudfront":
                self.cloudfront_origins[arn] = metrics.get("originDomains", [])
                # CloudFront is not VPC-resident — leave ctx empty

            self.resource_context[arn] = ctx

            # Fallback for any service that still lacks network context:
            # try ENI attachment index (covers EC2, ECS, etc.)
            if not ctx["security_group_ids"] or not ctx["subnet_id"]:
                eni = self.eni_by_attachment.get(raw_id) or self.eni_by_attachment.get(arn)
                if eni:
                    if not ctx["subnet_id"]:
                        ctx["subnet_id"] = eni.get("subnetId")
                    if not ctx["vpc_id"]:
                        ctx["vpc_id"] = eni.get("vpcId")
                    if not ctx["security_group_ids"]:
                        ctx["security_group_ids"] = set(eni.get("securityGroupIds", []))
