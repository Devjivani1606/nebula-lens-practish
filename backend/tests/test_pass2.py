import unittest
from unittest.mock import patch, MagicMock
from app.engines.relationship_engine import relationship_engine
from app.scanners.pass2_scanners import pass2_scanners

class TestPass2RelationshipEngine(unittest.TestCase):

    def setUp(self):
        self.node_by_arn = {
            "arn:aws:lambda:us-east-1:123456789012:function:my-function": {
                "resource_arn": "arn:aws:lambda:us-east-1:123456789012:function:my-function",
                "resource_name": "my-function",
                "raw_id": "my-function",
                "node": {"data": {"service": "lambda", "metrics": {
                    "roleArn": "arn:aws:iam::123456789012:role/my-role",
                    "vpcId": "vpc-12345",
                    "subnetIds": ["subnet-abc"],
                    "securityGroupIds": ["sg-xyz"],
                    "environment": {"Variables": {"QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/123456789012/my-queue", "SHORT": "queue"}}
                }}}
            },
            "arn:aws:iam::123456789012:role/my-role": {
                "resource_arn": "arn:aws:iam::123456789012:role/my-role",
                "raw_id": "my-role",
                "node": {"data": {"service": "iam"}}
            },
            "arn:aws:sqs:us-east-1:123456789012:my-queue": {
                "resource_arn": "arn:aws:sqs:us-east-1:123456789012:my-queue",
                "resource_name": "my-queue",
                "raw_id": "my-queue",
                "node": {"data": {"service": "sqs"}}
            },
            "arn:aws:ecs:us-east-1:123:task-definition/my-task": {
                "resource_arn": "arn:aws:ecs:us-east-1:123:task-definition/my-task",
                "node": {"data": {"service": "ecs", "metrics": {
                    "taskRoleArn": "arn:aws:iam::123456789012:role/ecs-task-role",
                    "secrets": [{"ValueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:my-secret"}],
                    "images": ["my-ecr-repo"]
                }}}
            },
            "arn:aws:iam::123456789012:role/ecs-task-role": {
                "resource_arn": "arn:aws:iam::123456789012:role/ecs-task-role"
            },
            "arn:aws:secretsmanager:us-east-1:123:secret:my-secret": {
                "resource_arn": "arn:aws:secretsmanager:us-east-1:123:secret:my-secret",
                "node": {"data": {"service": "secretsmanager", "metrics": {
                    "rotationLambdaARN": "arn:aws:lambda:us-east-1:123456789012:function:my-function"
                }}}
            },
            "arn:aws:states:us-east-1:123:stateMachine:my-sfn": {
                "resource_arn": "arn:aws:states:us-east-1:123:stateMachine:my-sfn",
                "node": {"data": {"service": "stepfunctions", "metrics": {
                    "states": {
                        "CallLambda": {"Type": "Task", "Resource": "arn:aws:lambda:us-east-1:123456789012:function:my-function"}
                    }
                }}}
            },
            "arn:aws:apigateway:us-east-1::/restapis/my-api": {
                "resource_arn": "arn:aws:apigateway:us-east-1::/restapis/my-api",
                "raw_id": "my-api",
                "node": {"data": {"service": "apigateway", "metrics": {
                    "integrations": ["arn:aws:lambda:us-east-1:123456789012:function:my-function"],
                    "vpcLinkId": "vpclink-123"
                }}}
            },
            "arn:aws:apigateway:us-east-1::/vpclinks/vpclink-123": {
                "resource_arn": "arn:aws:apigateway:us-east-1::/vpclinks/vpclink-123",
                "raw_id": "vpclink-123",
                "node": {"data": {"service": "apigateway"}}
            },
            "arn:aws:events:us-east-1:123456789012:rule/my-rule": {
                "resource_arn": "arn:aws:events:us-east-1:123456789012:rule/my-rule",
                "node": {"data": {"service": "eventbridge", "metrics": {
                    "targets": [{"Arn": "arn:aws:lambda:us-east-1:123456789012:function:my-function"}]
                }}}
            },
            "arn:aws:sns:us-east-1:123456789012:my-topic": {
                "resource_arn": "arn:aws:sns:us-east-1:123456789012:my-topic",
                "node": {"data": {"service": "sns", "metrics": {
                    "endpoints": {"Lambda": ["arn:aws:lambda:us-east-1:123456789012:function:my-function"]}
                }}}
            },
            "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/123": {
                "resource_arn": "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/123",
                "node": {"data": {"service": "alb", "metrics": {
                    "targetGroups": [{"TargetGroupArn": "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/456", "Targets": [{"Id": "i-123456"}]}],
                    "DNSName": "my-alb-12345.us-east-1.elb.amazonaws.com"
                }}}
            },
            "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/456": {
                "resource_arn": "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/456",
                "raw_id": "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/456",
                "node": {"data": {"service": "alb"}}
            },
            "arn:aws:ec2:us-east-1:123456789012:instance/i-123456": {
                "resource_arn": "arn:aws:ec2:us-east-1:123456789012:instance/i-123456",
                "raw_id": "i-123456",
                "node": {"data": {"service": "ec2"}}
            },
            "arn:aws:cloudfront::123456789012:distribution/E123": {
                "resource_arn": "arn:aws:cloudfront::123456789012:distribution/E123",
                "node": {"data": {"service": "cloudfront", "metrics": {
                    "origins": [{"DomainName": "my-bucket.s3.amazonaws.com"}, {"DomainName": "my-alb-12345.us-east-1.elb.amazonaws.com"}]
                }}}
            },
            "arn:aws:s3:::my-bucket": {
                "resource_arn": "arn:aws:s3:::my-bucket",
                "resource_name": "my-bucket",
                "node": {"data": {"service": "s3"}}
            },
            "arn:aws:rds:us-east-1:123456789012:db:my-db": {
                "resource_arn": "arn:aws:rds:us-east-1:123456789012:db:my-db",
                "node": {"data": {"service": "rds", "metrics": {
                    "dbSubnetGroupVpcId": "vpc-12345",
                    "subnets": ["subnet-abc"]
                }}}
            },
            "arn:aws:eks:us-east-1:123456789012:cluster/my-cluster": {
                "resource_arn": "arn:aws:eks:us-east-1:123456789012:cluster/my-cluster",
                "node": {"data": {"service": "eks", "metrics": {
                    "roleArn": "arn:aws:iam::123456789012:role/my-role",
                    "nodegroupArns": ["arn:aws:eks:us-east-1:123456789012:nodegroup/my-cluster/my-ng/123"]
                }}}
            },
            "arn:aws:eks:us-east-1:123456789012:nodegroup/my-cluster/my-ng/123": {
                "resource_arn": "arn:aws:eks:us-east-1:123456789012:nodegroup/my-cluster/my-ng/123",
                "raw_id": "arn:aws:eks:us-east-1:123456789012:nodegroup/my-cluster/my-ng/123",
                "node": {"data": {"service": "eks"}}
            }
        }
        
        self.by_service = {}
        for arn, node in self.node_by_arn.items():
            svc = node.get("node", {}).get("data", {}).get("service")
            if svc:
                self.by_service.setdefault(svc, []).append((arn, node))

        self.vpc_nodes_raw = [
            {
                "resource_arn": "arn:aws:ec2:us-east-1:123:vpc/vpc-12345",
                "raw_id": "vpc-12345",
                "node": {"data": {"metrics": {"securityGroups": [{"groupId": "sg-xyz"}]}}}
            }
        ]

    def test_pass2_lambda_rules(self):
        edges = relationship_engine._run_pass2_rules(self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        sources = [e['source'] for e in edges]
        self.assertIn('arn:aws:lambda:us-east-1:123456789012:function:my-function', sources)
        # Should link to my-role (uses), vpc-12345 (deployed_in via vpcId and security group)
        targets = [e['target'] for e in edges if e['source'] == 'arn:aws:lambda:us-east-1:123456789012:function:my-function']
        self.assertIn('arn:aws:iam::123456789012:role/my-role', targets)
        self.assertIn('arn:aws:sqs:us-east-1:123456789012:my-queue', targets)
        # Verify SHORT queue length < 10 does not explode
        self.assertNotIn('arn:aws:sqs:us-east-1:123456789012:short-queue', targets)
        
        # Verify provenance
        for e in edges:
            if e['source'] == 'arn:aws:lambda:us-east-1:123456789012:function:my-function' and e['target'] == 'arn:aws:sqs:us-east-1:123456789012:my-queue':
                self.assertEqual(e['evidence']['source'], 'CONFIG_ANALYSIS')
                self.assertEqual(e['evidence']['confidence'], 60)

    def test_apigateway_rules(self):
        edges = relationship_engine._run_pass2_rules(self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        targets = [e['target'] for e in edges if e['source'] == 'arn:aws:apigateway:us-east-1::/restapis/my-api']
        self.assertIn('arn:aws:lambda:us-east-1:123456789012:function:my-function', targets)
        self.assertIn('arn:aws:apigateway:us-east-1::/vpclinks/vpclink-123', targets)

    def test_eventbridge_sns_alb_rules(self):
        edges = relationship_engine._run_pass2_rules(self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        eb_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:events:us-east-1:123456789012:rule/my-rule']
        self.assertIn('arn:aws:lambda:us-east-1:123456789012:function:my-function', eb_targets)
        
        sns_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:sns:us-east-1:123456789012:my-topic']
        self.assertIn('arn:aws:lambda:us-east-1:123456789012:function:my-function', sns_targets)

        alb_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/123']
        self.assertIn('arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-tg/456', alb_targets)
        self.assertIn('arn:aws:ec2:us-east-1:123456789012:instance/i-123456', alb_targets)

    def test_cloudfront_domain_name_extractor(self):
        edges = relationship_engine._run_pass2_rules(self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        cf_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:cloudfront::123456789012:distribution/E123']
        self.assertIn('arn:aws:s3:::my-bucket', cf_targets)
        self.assertIn('arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/123', cf_targets)

    def test_rds_secrets_eks_rules(self):
        edges = relationship_engine._run_pass2_rules(self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        
        rds_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:rds:us-east-1:123456789012:db:my-db']
        self.assertIn('arn:aws:ec2:us-east-1:123:vpc/vpc-12345', rds_targets) # from dbSubnetGroupVpcId
        
        sm_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:secretsmanager:us-east-1:123:secret:my-secret']
        self.assertIn('arn:aws:lambda:us-east-1:123456789012:function:my-function', sm_targets)
        
        eks_targets = [e['target'] for e in edges if e['source'] == 'arn:aws:eks:us-east-1:123456789012:cluster/my-cluster']
        self.assertIn('arn:aws:iam::123456789012:role/my-role', eks_targets)
        self.assertIn('arn:aws:eks:us-east-1:123456789012:nodegroup/my-cluster/my-ng/123', eks_targets)

    def test_extractors(self):
        # arn_list
        t_arn = relationship_engine._run_extractor("arn_list", ["arn:aws:lambda:us-east-1:123456789012:function:my-function", "bad-arn"], "Lambda", self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        self.assertEqual(len(t_arn), 1)
        self.assertEqual(t_arn[0][0], "arn:aws:lambda:us-east-1:123456789012:function:my-function")

        # id_list
        t_id = relationship_engine._run_extractor("id_list", ["my-role", "nonexistent"], "IAM Role", self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        self.assertEqual(len(t_id), 1)
        self.assertEqual(t_id[0][0], "arn:aws:iam::123456789012:role/my-role")

        # name
        t_name = relationship_engine._run_extractor("name", ["my-function"], "Lambda", self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        self.assertEqual(len(t_name), 1)
        self.assertEqual(t_name[0][0], "arn:aws:lambda:us-east-1:123456789012:function:my-function")

        # domain_name
        t_domain = relationship_engine._run_extractor("domain_name", ["my-bucket.s3.amazonaws.com"], "S3 Bucket", self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        self.assertEqual(len(t_domain), 1)
        self.assertEqual(t_domain[0][0], "arn:aws:s3:::my-bucket")

    def test_edge_cases(self):
        # Null config
        t_null = relationship_engine._run_extractor("arn", [None, ""], "Lambda", self.node_by_arn, self.by_service, self.vpc_nodes_raw)
        self.assertEqual(len(t_null), 0)
        
        # Missing field -> _evaluate_path handles
        res = relationship_engine._evaluate_path({}, "missing.path")
        self.assertEqual(res, [])

    def test_deduplication(self):
        # Same source, target, different labels
        raw_edges = [
            {"source": "A", "target": "B", "label": "references", "confidence": 70, "evidence": ["ev1"]},
            {"source": "A", "target": "B", "label": "invokes", "confidence": 95, "evidence": ["ev2"]},
            {"source": "A", "target": "B", "label": "triggers", "confidence": 100, "evidence": ["ev3"]}
        ]
        
        # Hack deduplication by injecting raw edges
        with patch.object(relationship_engine, '_run_pass2_rules', return_value=raw_edges):
            res = relationship_engine.discover_relationships({}, [], [])
            # Res will have 1 edge between A and B
            self.assertEqual(len(res), 1)
            e = res[0]
            self.assertEqual(e['confidence'], 100)
            self.assertEqual(e['label'], 'triggers')
            self.assertIn('references', e['labels'])
            self.assertIn('invokes', e['labels'])
            self.assertIn('triggers', e['labels'])

    @patch('app.scanners.pass2_scanners.boto3.client')
    def test_boto3_collectors(self, mock_client):
        # Test SNS bulk paginator
        mock_sns = MagicMock()
        mock_client.return_value = mock_sns
        mock_sns.get_paginator.return_value.paginate.side_effect = [
            [{'Topics': [{'TopicArn': 'arn1'}]}],
            [{'Subscriptions': [{'TopicArn': 'arn1', 'Protocol': 'lambda', 'Endpoint': 'e1'}]}]
        ]
        res = pass2_scanners.scan_sns({"AccessKeyId": "", "SecretAccessKey": "", "SessionToken": ""}, "us-east-1", "123")
        self.assertEqual(len(res['nodes']), 1)
        self.assertEqual(res['nodes'][0]['resource_arn'], 'arn1')

        # Test ALB paginator
        mock_alb = MagicMock()
        mock_client.return_value = mock_alb
        mock_alb.get_paginator.return_value.paginate.side_effect = [
            [{'LoadBalancers': [{'LoadBalancerArn': 'alb1', 'LoadBalancerName': 'alb1'}]}],
            [{'TargetGroups': [{'TargetGroupArn': 'tg1'}]}]
        ]
        mock_alb.describe_target_health.return_value = {'TargetHealthDescriptions': []}
        res2 = pass2_scanners.scan_alb({"AccessKeyId": "", "SecretAccessKey": "", "SessionToken": ""}, "us-east-1", "123")
        self.assertEqual(len(res2['nodes']), 1)
        self.assertEqual(res2['nodes'][0]['resource_arn'], 'alb1')

if __name__ == '__main__':
    unittest.main()
