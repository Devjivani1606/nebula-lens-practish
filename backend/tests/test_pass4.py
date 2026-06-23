"""
Pass 4 — Network Topology Resolution
Full pytest test suite covering all 20 test cases from the audit matrix.
"""
import unittest
import logging
from unittest.mock import patch

from app.engines.pass4_network_resolver import Pass4NetworkTopologyResolver
from app.engines.pass4_network_mapper import Pass4NetworkMapper
from app.engines.relationship_engine import relationship_engine

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _node(arn, service, raw_id=None, metrics=None, resource_name=None):
    """Build a minimal node dict as the pipeline produces."""
    return {
        "resource_arn": arn,
        "raw_id": raw_id or arn,
        "resource_name": resource_name or raw_id or arn,
        "node": {"data": {"service": service, "metrics": metrics or {}}}
    }


def _vpc_node(vpc_id, sgs=None, endpoints=None, enis=None):
    """Build a VPC node that carries SG/endpoint/ENI metadata."""
    return {
        "resource_arn": f"arn:aws:ec2:us-east-1:123:vpc/{vpc_id}",
        "raw_id": vpc_id,
        "resource_name": vpc_id,
        "node": {"data": {"service": "vpc", "metrics": {
            "securityGroups": sgs or [],
            "endpoints": endpoints or [],
            "enis": enis or [],
        }}}
    }


def run_pass4(nodes):
    resolver = Pass4NetworkTopologyResolver()
    return resolver.run_pass4(nodes)


def edges_between(edges, src, tgt):
    return [e for e in edges if e["source"] == src and e["target"] == tgt]


# ---------------------------------------------------------------------------
# SG helpers
# ---------------------------------------------------------------------------

def _sg(sg_id, ingress_from_sg=None, port_from=80, port_to=80, wide=False):
    """Build a security group dict with one ingress rule referencing another SG."""
    if ingress_from_sg is None:
        return {"groupId": sg_id, "ipPermissions": []}
    port_f = 0 if wide else port_from
    port_t = 65535 if wide else port_to
    return {
        "groupId": sg_id,
        "ipPermissions": [{
            "fromPort": port_f,
            "toPort": port_t,
            "userIdGroupPairs": [{"groupId": ingress_from_sg}]
        }]
    }


# ===========================================================================
# Test class
# ===========================================================================

class TestPass4NetworkResolver(unittest.TestCase):

    # ── 1. EC2 → RDS via SG ingress reference ──────────────────────────────
    def test_ec2_rds_sg_ingress_specific_port(self):
        """EC2 in sg-app, RDS allows ingress from sg-app on 5432 → confidence 85."""
        nodes = [
            _vpc_node("vpc-1", sgs=[
                _sg("sg-app"),
                _sg("sg-db", ingress_from_sg="sg-app", port_from=5432, port_to=5432),
            ]),
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-app"]}),
            _node("arn:aws:rds:us-east-1:123:db/db-1", "rds", "db-1",
                  {"dbSubnetGroupVpcId": "vpc-1",
                   "subnets": [{"SubnetIdentifier": "sub-1"}],
                   "vpcSecurityGroups": [{"VpcSecurityGroupId": "sg-db"}]}),
        ]
        edges = run_pass4(nodes)
        found = edges_between(edges,
                              "arn:aws:ec2:us-east-1:123:instance/i-1",
                              "arn:aws:rds:us-east-1:123:db/db-1")
        self.assertTrue(found, "Expected EC2 → RDS edge via SG ingress")
        e = found[0]
        self.assertEqual(e["confidence"], 85)
        ev = e["evidence"][0]
        self.assertIn("sg-app", ev["confidence_reason"])
        self.assertIn("sg-db", ev["confidence_reason"])
        self.assertIn("5432", ev["confidence_reason"])

    # ── 2. Lambda → RDS via SG ingress ──────────────────────────────────────
    def test_lambda_rds_sg_ingress(self):
        """Lambda in sg-app, RDS allows ingress from sg-app → edge emitted, confidence 85."""
        nodes = [
            _vpc_node("vpc-1", sgs=[
                _sg("sg-app"),
                _sg("sg-db", ingress_from_sg="sg-app", port_from=5432, port_to=5432),
            ]),
            _node("arn:aws:lambda:us-east-1:123:function:fn", "lambda", "fn",
                  {"vpcId": "vpc-1", "subnetIds": ["sub-1"], "securityGroupIds": ["sg-app"]}),
            _node("arn:aws:rds:us-east-1:123:db/db-1", "rds", "db-1",
                  {"dbSubnetGroupVpcId": "vpc-1",
                   "subnets": [{"SubnetIdentifier": "sub-1"}],
                   "vpcSecurityGroups": [{"VpcSecurityGroupId": "sg-db"}]}),
        ]
        edges = run_pass4(nodes)
        found = edges_between(edges,
                              "arn:aws:lambda:us-east-1:123:function:fn",
                              "arn:aws:rds:us-east-1:123:db/db-1")
        self.assertTrue(found)
        self.assertEqual(found[0]["confidence"], 85)

    # ── 3. ALB → EC2 via target group (instance type) ───────────────────────
    def test_alb_ec2_target_group_instance(self):
        """ALB with instance-type target group containing EC2 → edge emitted, confidence 95."""
        ec2_raw_id = "i-abc123"
        nodes = [
            _vpc_node("vpc-1"),
            _node("arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/alb/1",
                  "alb", "alb-1",
                  {"targetGroups": [{"TargetGroupArn": "arn:tg-1", "TargetType": "instance",
                                     "Targets": [{"Id": ec2_raw_id}]}]}),
            _node("arn:aws:ec2:us-east-1:123:instance/i-abc123", "ec2", ec2_raw_id, {}),
        ]
        edges = run_pass4(nodes)
        found = edges_between(edges,
                              "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/alb/1",
                              "arn:aws:ec2:us-east-1:123:instance/i-abc123")
        self.assertTrue(found, "Expected ALB → EC2 edge via target group")
        self.assertEqual(found[0]["confidence"], 95)

    # ── 4. ALB → ECS via target group (IP type) ─────────────────────────────
    def test_alb_ecs_target_group_ip(self):
        """ALB with ip-type target pointing to 10.0.1.45; ENI resolves to ECS task."""
        ecs_task_arn = "arn:aws:ecs:us-east-1:123:task/cluster-1/task-abc"
        target_ip = "10.0.1.45"
        eni = {
            "networkInterfaceId": "eni-abc",
            "subnetId": "sub-1",
            "vpcId": "vpc-1",
            "securityGroupIds": ["sg-ecs"],
            "privateIpAddress": target_ip,
            "privateIpAddresses": [{"privateIpAddress": target_ip}],
            "task_arn": ecs_task_arn,
            "attachment": None
        }
        nodes = [
            _vpc_node("vpc-1", enis=[eni]),
            _node("arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/alb/1",
                  "alb", "alb-1",
                  {"targetGroups": [{"TargetGroupArn": "arn:tg-1", "TargetType": "ip",
                                     "Targets": [{"Id": target_ip}]}]}),
            _node(ecs_task_arn, "ecs", ecs_task_arn, {}),
        ]
        edges = run_pass4(nodes)
        found = edges_between(edges,
                              "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/alb/1",
                              ecs_task_arn)
        self.assertTrue(found, "Expected ALB → ECS task edge via IP resolution")
        self.assertEqual(found[0]["confidence"], 95)
        ev = found[0]["evidence"][0]
        self.assertEqual(ev["matched_on"]["target_type"], "ip")
        self.assertEqual(ev["matched_on"]["resolved_task_arn"], ecs_task_arn)

    # ── 5. CloudFront → S3 origin ────────────────────────────────────────────
    def test_cloudfront_s3_origin(self):
        """CloudFront with S3 origin domain → edge to S3 bucket, confidence 95."""
        nodes = [
            _vpc_node("vpc-1"),
            _node("arn:aws:cloudfront::123:distribution/E1", "cloudfront", "E1",
                  {"originDomains": ["my-bucket.s3.amazonaws.com"]},
                  resource_name="E1"),
            _node("arn:aws:s3:::my-bucket", "s3", "my-bucket", {},
                  resource_name="my-bucket"),
        ]
        edges = run_pass4(nodes)
        found = edges_between(edges,
                              "arn:aws:cloudfront::123:distribution/E1",
                              "arn:aws:s3:::my-bucket")
        self.assertTrue(found, "Expected CloudFront → S3 edge")
        self.assertEqual(found[0]["confidence"], 95)

    # ── 6. CloudFront → ALB origin ───────────────────────────────────────────
    def test_cloudfront_alb_origin(self):
        """CloudFront with ALB DNS as origin → edge to ALB, confidence 95."""
        alb_dns = "my-alb-12345.us-east-1.elb.amazonaws.com"
        nodes = [
            _vpc_node("vpc-1"),
            _node("arn:aws:cloudfront::123:distribution/E2", "cloudfront", "E2",
                  {"originDomains": [alb_dns]}, resource_name="E2"),
            _node("arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/alb/1",
                  "alb", "alb-1",
                  {"DNSName": alb_dns, "targetGroups": [], "securityGroups": [], "subnets": []}),
        ]
        edges = run_pass4(nodes)
        found = edges_between(edges,
                              "arn:aws:cloudfront::123:distribution/E2",
                              "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/alb/1")
        self.assertTrue(found, "Expected CloudFront → ALB edge")
        self.assertEqual(found[0]["confidence"], 95)

    # ── 7. VPC endpoint → resource (NOT Cartesian) ───────────────────────────
    def test_vpc_endpoint_emits_resource_to_endpoint_not_bucket(self):
        """Rule 4 must emit Resource → VPC Endpoint ID/ARN, NOT Resource → S3 bucket."""
        ep_id = "vpce-111"
        nodes = [
            _vpc_node("vpc-1", endpoints=[{
                "vpcEndpointId": ep_id,
                "vpcId": "vpc-1",
                "serviceName": "com.amazonaws.us-east-1.s3",
            }]),
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": []}),
            # S3 bucket — must NOT be the target of a Rule 4 edge
            _node("arn:aws:s3:::some-bucket", "s3", "some-bucket", {},
                  resource_name="some-bucket"),
        ]
        edges = run_pass4(nodes)

        # No edge from EC2 → S3 via vpc_endpoint rule
        bad_edges = [
            e for e in edges
            if e["source"] == "arn:aws:ec2:us-east-1:123:instance/i-1"
            and e["target"] == "arn:aws:s3:::some-bucket"
            and any(ev.get("rule") == "vpc_endpoint" for ev in e.get("evidence", []))
        ]
        self.assertEqual(bad_edges, [], "Rule 4 must not produce Cartesian edges to S3 buckets")

        # Edge from EC2 → endpoint ID/ARN must exist
        ep_edges = [
            e for e in edges
            if e["source"] == "arn:aws:ec2:us-east-1:123:instance/i-1"
            and e["target"] == ep_id
        ]
        self.assertTrue(ep_edges, "Expected EC2 → VPC endpoint edge")
        self.assertEqual(ep_edges[0]["confidence"], 80)

    # ── 8. Duplicate from Pass 1 — higher confidence wins ───────────────────
    def test_duplicate_pass1_edge_higher_confidence_wins(self):
        """Pass 1 edge at conf 100 + Pass 4 at 95 → single edge, conf 100, both evidence."""
        pass1_edge = {
            "source": "arn:A",
            "target": "arn:B",
            "label": "routes_to",
            "confidence": 100,
            "evidence": [{"source": "EXPLICIT_CONFIG", "rule": "pass1", "confidence": 100,
                          "confidence_reason": "explicit", "matched_on": {}}]
        }
        pass4_edge = {
            "source": "arn:A",
            "target": "arn:B",
            "label": "network_inferred",
            "confidence": 95,
            "evidence": [{"source": "NETWORK_TOPOLOGY", "rule": "alb_target_group",
                          "confidence": 95, "confidence_reason": "TG", "matched_on": {}}]
        }
        raw = [pass1_edge, pass4_edge]
        with patch.object(relationship_engine, '_run_pass2_rules', return_value=raw):
            result = relationship_engine.discover_relationships({}, [], [])
        self.assertEqual(len(result), 1, "Expected exactly one deduped edge")
        e = result[0]
        self.assertEqual(e["confidence"], 100)
        ev_rules = [ev.get("rule") if isinstance(ev, dict) else None for ev in e.get("evidence", [])]
        self.assertIn("pass1", ev_rules)
        self.assertIn("alb_target_group", ev_rules)

    # ── 9. Duplicate from Pass 2 — higher confidence wins ───────────────────
    def test_duplicate_pass2_edge_higher_confidence_wins(self):
        """Pass 2 edge at 70, Pass 4 at 85 → single edge, confidence 85."""
        pass2_edge = {
            "source": "arn:A",
            "target": "arn:B",
            "label": "references",
            "confidence": 70,
            "evidence": [{"source": "CONFIG_ANALYSIS", "rule": "pass2", "confidence": 70,
                          "confidence_reason": "env var", "matched_on": {}}]
        }
        pass4_edge = {
            "source": "arn:A",
            "target": "arn:B",
            "label": "network_inferred",
            "confidence": 85,
            "evidence": [{"source": "NETWORK_TOPOLOGY", "rule": "sg_ingress_reference",
                          "confidence": 85, "confidence_reason": "SG", "matched_on": {}}]
        }
        raw = [pass2_edge, pass4_edge]
        with patch.object(relationship_engine, '_run_pass2_rules', return_value=raw):
            result = relationship_engine.discover_relationships({}, [], [])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["confidence"], 85)

    # ── 10. Reverse edge not emitted ────────────────────────────────────────
    def test_reverse_edge_not_emitted(self):
        """Rule fires A→B; B→A must not appear for the same rule."""
        nodes = [
            _vpc_node("vpc-1", sgs=[
                _sg("sg-a"),
                _sg("sg-b", ingress_from_sg="sg-a", port_from=443, port_to=443),
            ]),
            _node("arn:aws:ec2:us-east-1:123:instance/i-a", "ec2", "i-a",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-a"]}),
            _node("arn:aws:ec2:us-east-1:123:instance/i-b", "ec2", "i-b",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-b"]}),
        ]
        edges = run_pass4(nodes)
        forward = edges_between(edges,
                                "arn:aws:ec2:us-east-1:123:instance/i-a",
                                "arn:aws:ec2:us-east-1:123:instance/i-b")
        reverse = [
            e for e in edges
            if e["source"] == "arn:aws:ec2:us-east-1:123:instance/i-b"
            and e["target"] == "arn:aws:ec2:us-east-1:123:instance/i-a"
            and any(ev.get("rule") == "sg_ingress_reference" for ev in e.get("evidence", []))
        ]
        self.assertTrue(forward, "Forward edge A→B must exist")
        self.assertEqual(reverse, [], "Reverse edge B→A must NOT be emitted for same rule")

    # ── 11. Cross-VPC — no edge ──────────────────────────────────────────────
    def test_cross_vpc_no_edge_emitted(self):
        """Resources in different VPCs with no shared SG → no edge from Rules 5/6."""
        nodes = [
            _vpc_node("vpc-1"),
            _vpc_node("vpc-2"),
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": []}),
            _node("arn:aws:rds:us-east-1:123:db/db-1", "rds", "db-1",
                  {"dbSubnetGroupVpcId": "vpc-2",
                   "subnets": [{"SubnetIdentifier": "sub-2"}],
                   "vpcSecurityGroups": []}),
        ]
        edges = run_pass4(nodes)
        cross = edges_between(edges,
                              "arn:aws:ec2:us-east-1:123:instance/i-1",
                              "arn:aws:rds:us-east-1:123:db/db-1")
        self.assertEqual(cross, [], "No edge expected between resources in different VPCs")

    # ── 12. Missing SG in inventory — no crash ──────────────────────────────
    def test_missing_sg_no_crash(self):
        """SG referenced in node metrics but absent from VPC inventory → no edge, no crash."""
        nodes = [
            _vpc_node("vpc-1", sgs=[]),  # sg-ghost not in inventory
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-ghost"]}),
            _node("arn:aws:rds:us-east-1:123:db/db-1", "rds", "db-1",
                  {"dbSubnetGroupVpcId": "vpc-1",
                   "subnets": [{"SubnetIdentifier": "sub-1"}],
                   "vpcSecurityGroups": [{"VpcSecurityGroupId": "sg-ghost"}]}),
        ]
        try:
            edges = run_pass4(nodes)
        except Exception as ex:
            self.fail(f"run_pass4 raised an exception with missing SG: {ex}")

    # ── 13. Shared subnet — confidence 45 ──────────────────────────────────
    def test_shared_subnet_confidence_45(self):
        """Two resources in same subnet, no SG match → shared_subnet edge, 40 ≤ conf ≤ 50."""
        nodes = [
            _vpc_node("vpc-1"),
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-shared", "securityGroupIds": []}),
            _node("arn:aws:lambda:us-east-1:123:function:fn", "lambda", "fn",
                  {"vpcId": "vpc-1", "subnetIds": ["sub-shared"], "securityGroupIds": []}),
        ]
        edges = run_pass4(nodes)
        subnet_edges = [
            e for e in edges
            if any(ev.get("rule") == "shared_subnet" for ev in e.get("evidence", []))
        ]
        self.assertTrue(subnet_edges, "Expected a shared_subnet edge")
        for e in subnet_edges:
            self.assertGreaterEqual(e["confidence"], 40)
            self.assertLessEqual(e["confidence"], 50)

    # ── 14. Same VPC only — confidence 25 ───────────────────────────────────
    def test_same_vpc_only_confidence_25(self):
        """Two resources same VPC, different subnets, no SG → same_vpc edge, 20 ≤ conf ≤ 30."""
        nodes = [
            _vpc_node("vpc-1"),
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-a", "securityGroupIds": []}),
            _node("arn:aws:lambda:us-east-1:123:function:fn", "lambda", "fn",
                  {"vpcId": "vpc-1", "subnetIds": ["sub-b"], "securityGroupIds": []}),
        ]
        edges = run_pass4(nodes)
        vpc_edges = [
            e for e in edges
            if any(ev.get("rule") == "same_vpc" for ev in e.get("evidence", []))
        ]
        self.assertTrue(vpc_edges, "Expected a same_vpc edge")
        for e in vpc_edges:
            self.assertGreaterEqual(e["confidence"], 20)
            self.assertLessEqual(e["confidence"], 30)

    # ── 15. Wide port range SG — confidence 70 ──────────────────────────────
    def test_wide_port_range_sg_confidence_70(self):
        """SG ingress allows 0–65535 (wide) → confidence exactly 70, not 85."""
        nodes = [
            _vpc_node("vpc-1", sgs=[
                _sg("sg-a"),
                _sg("sg-b", ingress_from_sg="sg-a", wide=True),
            ]),
            _node("arn:aws:ec2:us-east-1:123:instance/i-a", "ec2", "i-a",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-a"]}),
            _node("arn:aws:ec2:us-east-1:123:instance/i-b", "ec2", "i-b",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-b"]}),
        ]
        edges = run_pass4(nodes)
        sg_edges = [
            e for e in edges
            if any(ev.get("rule") == "sg_ingress_reference" for ev in e.get("evidence", []))
        ]
        self.assertTrue(sg_edges)
        for e in sg_edges:
            self.assertEqual(e["confidence"], 70,
                             "Wide port range must produce confidence 70, not 85")

    # ── 16. Wildcard CIDR ingress — no SG-to-SG edge ───────────────────────
    def test_wildcard_cidr_ingress_no_edge(self):
        """SG ingress from 0.0.0.0/0 (ipRanges, no userIdGroupPairs) → no edge emitted."""
        nodes = [
            _vpc_node("vpc-1", sgs=[{
                "groupId": "sg-public",
                "ipPermissions": [{
                    "fromPort": 443,
                    "toPort": 443,
                    # No userIdGroupPairs — only ipRanges (not processed by Rule 1)
                    "userIdGroupPairs": [],
                    "ipRanges": [{"CidrIp": "0.0.0.0/0"}]
                }]
            }]),
            _node("arn:aws:ec2:us-east-1:123:instance/i-1", "ec2", "i-1",
                  {"vpcId": "vpc-1", "subnetId": "sub-1", "securityGroupIds": ["sg-public"]}),
            _node("arn:aws:rds:us-east-1:123:db/db-1", "rds", "db-1",
                  {"dbSubnetGroupVpcId": "vpc-1",
                   "subnets": [{"SubnetIdentifier": "sub-1"}],
                   "vpcSecurityGroups": [{"VpcSecurityGroupId": "sg-public"}]}),
        ]
        edges = run_pass4(nodes)
        sg_edges = [
            e for e in edges
            if any(ev.get("rule") == "sg_ingress_reference" for ev in e.get("evidence", []))
        ]
        self.assertEqual(sg_edges, [],
                         "Wildcard CIDR (0.0.0.0/0) must NOT produce sg_ingress_reference edges")

    # ── 17. Subnet circuit breaker — 25 resources ───────────────────────────
    def test_subnet_circuit_breaker_skips_large_subnet(self):
        """25 resources in one subnet → Rule 5 skips, warning logged."""
        nodes = [_vpc_node("vpc-1")]
        for i in range(25):
            nodes.append(_node(
                f"arn:aws:ec2:us-east-1:123:instance/i-{i}", "ec2", f"i-{i}",
                {"vpcId": "vpc-1", "subnetId": "sub-big", "securityGroupIds": []}
            ))
        with self.assertLogs("app.engines.pass4_network_resolver", level="WARNING") as cm:
            edges = run_pass4(nodes)
        subnet_edges = [
            e for e in edges
            if any(ev.get("rule") == "shared_subnet" for ev in e.get("evidence", []))
        ]
        self.assertEqual(subnet_edges, [], "Rule 5 must be suppressed for large subnet")
        self.assertTrue(
            any("sub-big" in msg and "safety threshold" in msg for msg in cm.output),
            "Expected warning log mentioning sub-big and safety threshold"
        )

    # ── 18. VPC circuit breaker — 35 resources ──────────────────────────────
    def test_vpc_circuit_breaker_skips_large_vpc(self):
        """35 resources in one VPC in different subnets → Rule 6 skips, warning logged."""
        nodes = [_vpc_node("vpc-big")]
        for i in range(35):
            nodes.append(_node(
                f"arn:aws:ec2:us-east-1:123:instance/i-{i}", "ec2", f"i-{i}",
                {"vpcId": "vpc-big", "subnetId": f"sub-{i}", "securityGroupIds": []}
            ))
        with self.assertLogs("app.engines.pass4_network_resolver", level="WARNING") as cm:
            edges = run_pass4(nodes)
        vpc_edges = [
            e for e in edges
            if any(ev.get("rule") == "same_vpc" for ev in e.get("evidence", []))
        ]
        self.assertEqual(vpc_edges, [], "Rule 6 must be suppressed for large VPC")
        self.assertTrue(
            any("vpc-big" in msg and "safety threshold" in msg for msg in cm.output),
            "Expected warning log mentioning vpc-big and safety threshold"
        )

    # ── 19. ALB collector pagination — all TGs fetched ──────────────────────
    def test_alb_collector_paginates_target_groups(self):
        """ALB collector must call describe_target_groups without LoadBalancerArn and collect all pages."""
        from unittest.mock import MagicMock
        from app.scanners.pass2_scanners import Pass2Scanners

        scanner = Pass2Scanners()

        mock_elbv2 = MagicMock()
        creds = {"AccessKeyId": "", "SecretAccessKey": "", "SessionToken": ""}

        # Simulate 2 pages of target groups returned by a single unfiltered call
        def paginate_side_effect(**kwargs):
            # Must NOT have a LoadBalancerArn kwarg — verifies no per-ALB filter
            if "LoadBalancerArn" in kwargs:
                raise AssertionError("describe_target_groups must not be filtered by LoadBalancerArn")
            return [
                {"TargetGroups": [{"TargetGroupArn": "tg-1", "TargetType": "instance",
                                   "LoadBalancerArns": ["alb-1"]}]},
                {"TargetGroups": [{"TargetGroupArn": "tg-2", "TargetType": "instance",
                                   "LoadBalancerArns": ["alb-1"]}]},
            ]

        def get_paginator_side(op):
            pg = MagicMock()
            if op == "describe_load_balancers":
                pg.paginate.return_value = [{"LoadBalancers": [
                    {"LoadBalancerArn": "alb-1", "LoadBalancerName": "alb-1",
                     "VpcId": "vpc-1", "SecurityGroups": [], "AvailabilityZones": []}
                ]}]
            elif op == "describe_target_groups":
                pg.paginate.side_effect = paginate_side_effect
            elif op == "describe_target_health":
                pg.paginate.return_value = [{"TargetHealthDescriptions": []}]
            return pg

        mock_elbv2.get_paginator.side_effect = get_paginator_side

        with patch.object(scanner, '_get_boto', return_value=mock_elbv2):
            result = scanner.scan_alb(creds, "us-east-1", "123")

        self.assertEqual(len(result["nodes"]), 1)
        # Both TGs from both pages should have been collected
        tgs = result["nodes"][0]["node"]["data"]["metrics"].get("targetGroups", [])
        tg_arns = [tg["TargetGroupArn"] for tg in tgs]
        self.assertIn("tg-1", tg_arns)
        self.assertIn("tg-2", tg_arns)

    # ── 20. Full pipeline regression — Pass 1/2/3 edges unchanged ───────────
    def test_full_pipeline_pass123_edges_unchanged(self):
        """Injecting known Pass 1-3 edges then running discover_relationships must return same edges."""
        pass123_edges = [
            {"source": "arn:A", "target": "arn:B", "label": "invokes", "confidence": 90,
             "evidence": [{"source": "EXPLICIT_CONFIG", "rule": "iam", "confidence": 90,
                           "confidence_reason": "role trust", "matched_on": {}}]},
            {"source": "arn:B", "target": "arn:C", "label": "writes_to", "confidence": 80,
             "evidence": [{"source": "CONFIG_ANALYSIS", "rule": "env_ref", "confidence": 80,
                           "confidence_reason": "env var", "matched_on": {}}]},
        ]
        with patch.object(relationship_engine, '_run_pass2_rules', return_value=pass123_edges):
            result = relationship_engine.discover_relationships({}, [], [])

        # Both edges must be preserved
        result_pairs = {(e["source"], e["target"]) for e in result}
        self.assertIn(("arn:A", "arn:B"), result_pairs)
        self.assertIn(("arn:B", "arn:C"), result_pairs)


if __name__ == "__main__":
    unittest.main()
