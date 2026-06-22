import hashlib
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class NormalizationEngine:
    """
    Converts raw AWS API responses into
    the standard Node/Edge format for React Flow.
    """

    # ─────────────────────────────────────────
    # FINGERPRINT
    # ─────────────────────────────────────────

    def generate_fingerprint(self, data: dict) -> str:
        """
        Generate SHA256 hash of resource data.
        If hash changes between versions = resource was modified.
        """
        # Sort keys so order doesn't affect hash
        data_string = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(data_string.encode()).hexdigest()

    # ─────────────────────────────────────────
    # BUILD NODE
    # ─────────────────────────────────────────

    def build_node(
        self,
        resource_arn: str,
        node_type: str,
        name: str,
        service: str,
        region: str,
        account_id: str,
        metrics: dict,
        insights: str = "",
        parent_arn: Optional[str] = None,
        extra_data: dict = {}
    ) -> dict:
        """
        Build a standard React Flow node.
        parentID is only added if it exists — never null.
        """
        node = {
            "id": resource_arn,
            "type": node_type,
            "position": {"x": 0, "y": 0},
            "data": {
                "name": name,
                "insights": insights,
                "service": service,
                "region": region,
                "account_id": account_id,
                "resource_arn": resource_arn,
                "metrics": metrics,
                **extra_data
            }
        }

        # Only add parentID if it actually has a value
        if parent_arn:
            node["parentID"] = parent_arn
            node["parentId"] = parent_arn

        return node

    # ─────────────────────────────────────────
    # BUILD EDGE
    # ─────────────────────────────────────────

    def build_edge(
        self,
        source_arn: str,
        target_arn: str,
        label: str
    ) -> dict:
        """
        Build a standard React Flow edge.
        Always uses animatedEdge type.
        """
        edge_id = f"edge-{source_arn[-8:]}-{target_arn[-8:]}"
        return {
            "id": edge_id,
            "source": source_arn,
            "target": target_arn,
            "type": "animatedEdge",
            "label": label
        }

    # ─────────────────────────────────────────
    # VPC NORMALIZER
    # ─────────────────────────────────────────

    def normalize_vpc(self, vpc: dict, region: str, account_id: str, endpoints: list = None, security_groups: list = None) -> dict:
        """
        Convert raw AWS VPC response into standard node format.
        """
        vpc_id = vpc['VpcId']
        resource_arn = f"arn:aws:ec2:{region}:{account_id}:vpc/{vpc_id}"

        # Get name from tags
        name = self._get_tag(vpc, 'Name') or vpc_id

        # Check if default VPC
        is_default = vpc.get('IsDefault', False)

        metrics = {
            "cidrBlock": vpc.get('CidrBlock', 'N/A'),
            "state": vpc.get('State', 'N/A'),
            "isDefault": is_default,
            "region": region,
            "securityScan": self._scan_vpc(vpc),
            "endpoints": endpoints or [],
            "securityGroups": security_groups or []
        }

        insights = "Default VPC" if is_default else "Custom VPC"

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="vpcNode",
            name=name,
            service="vpc",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights
        )

        # Generate fingerprint from metrics
        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": name,
            "vpc_id": vpc_id,
            "raw_id": vpc_id
        }

    # ─────────────────────────────────────────
    # SUBNET NORMALIZER
    # ─────────────────────────────────────────

    def normalize_subnet(
        self,
        subnet: dict,
        region: str,
        account_id: str,
        vpc_arn: str
    ) -> dict:
        """
        Convert raw AWS Subnet response into standard node format.
        Parent is always the VPC.
        """
        subnet_id = subnet['SubnetId']
        resource_arn = f"arn:aws:ec2:{region}:{account_id}:subnet/{subnet_id}"

        name = self._get_tag(subnet, 'Name') or subnet_id

        # Determine if public or private
        is_public = subnet.get('MapPublicIpOnLaunch', False)
        subnet_type = "Public Subnet" if is_public else "Private Subnet"

        metrics = {
            "cidrBlock": subnet.get('CidrBlock', 'N/A'),
            "availabilityZone": subnet.get('AvailabilityZone', 'N/A'),
            "availableIPs": subnet.get('AvailableIpAddressCount', 0),
            "type": subnet_type,
            "region": region,
            "securityScan": "Pass" if not is_public else "Warning: Public subnet"
        }

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="subnetNode",
            name=name,
            service="subnet",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=subnet_type,
            parent_arn=vpc_arn
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": name,
            "raw_id": subnet_id,
            "vpc_id": subnet.get('VpcId'),
            "parent_arn": vpc_arn
        }

    # ─────────────────────────────────────────
    # EC2 NORMALIZER
    # ─────────────────────────────────────────

    def normalize_ec2(
        self,
        instance: dict,
        region: str,
        account_id: str,
        subnet_map: dict = {}
    ) -> dict:
        """
        Convert raw AWS EC2 instance into standard node format.
        Parent is Subnet if instance is inside a VPC.
        """
        instance_id = instance['InstanceId']
        resource_arn = f"arn:aws:ec2:{region}:{account_id}:instance/{instance_id}"

        # Get name from tags
        name = self._get_tag(instance, 'Name') or instance_id

        # Get subnet parent
        subnet_id = instance.get('SubnetId')
        subnet_arn = subnet_map.get(subnet_id) if subnet_id else None

        # Get public IP if exists
        public_ip = instance.get('PublicIpAddress', 'None')
        private_ip = instance.get('PrivateIpAddress', 'None')

        # Get state
        state = instance.get('State', {}).get('Name', 'unknown')

        # Get security groups
        security_groups = [
            sg.get('GroupName', '') 
            for sg in instance.get('SecurityGroups', [])
        ]
        security_group_ids = [
            sg.get('GroupId', '') 
            for sg in instance.get('SecurityGroups', [])
        ]
        iam_profile = instance.get('IamInstanceProfile', {})
        iam_profile_arn = iam_profile.get('Arn', '')

        metrics = {
            "instanceType": instance.get('InstanceType', 'N/A'),
            "state": state,
            "privateIp": private_ip,
            "publicIp": public_ip,
            "securityGroups": security_groups,
            "securityGroupIds": security_group_ids,
            "vpcId": instance.get('VpcId', ''),
            "subnetId": subnet_id or '',
            "iamInstanceProfileArn": iam_profile_arn,
            "availabilityZone": instance.get('Placement', {}).get('AvailabilityZone', 'N/A'),
            "region": region,
            "securityScan": self._scan_ec2(instance)
        }

        insights = f"{state.capitalize()} - {instance.get('InstanceType', 'N/A')}"

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="ec2Node",
            name=name,
            service="ec2",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights,
            parent_arn=subnet_arn
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": name,
            "raw_id": instance_id,
            "parent_arn": subnet_arn
        }

    # ─────────────────────────────────────────
    # S3 NORMALIZER
    # ─────────────────────────────────────────

    def normalize_s3(
        self,
        bucket: dict,
        account_id: str,
        location: str = "us-east-1",
        public_access: dict = {},
        versioning: str = "Disabled",
        notification_config: dict = None
    ) -> dict:
        """
        Convert raw AWS S3 bucket into standard node format.
        S3 has no parent (not inside VPC).
        """
        bucket_name = bucket['Name']
        resource_arn = f"arn:aws:s3:::{bucket_name}"
        region = location

        is_public_blocked = public_access.get(
            'BlockPublicAcls', False
        )

        metrics = {
            "versioning": versioning,
            "publicAccess": "Blocked" if is_public_blocked else "Open",
            "creationDate": str(bucket.get('CreationDate', 'N/A')),
            "region": region,
            "securityScan": "Pass: Block Public Access enabled" 
                           if is_public_blocked 
                           else "Warning: Public access may be open",
            "bucketArn": resource_arn,
            "notificationConfiguration": notification_config or {}
        }

        insights = "Public Access Blocked" if is_public_blocked else "Warning: Check Access"

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="s3Node",
            name=bucket_name,
            service="s3",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights
            # No parent_arn — S3 is not inside VPC
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": bucket_name,
            "raw_id": bucket_name
        }

    # ─────────────────────────────────────────
    # RDS NORMALIZER
    # ─────────────────────────────────────────

    def normalize_rds(
        self,
        db_instance: dict,
        region: str,
        account_id: str,
        subnet_arn: Optional[str] = None
    ) -> dict:
        """
        Convert raw AWS RDS response into standard node format.
        Parent is Subnet if inside VPC.
        """
        db_id = db_instance['DBInstanceIdentifier']
        resource_arn = db_instance.get(
            'DBInstanceArn',
            f"arn:aws:rds:{region}:{account_id}:db:{db_id}"
        )

        engine = db_instance.get('Engine', 'N/A')
        engine_version = db_instance.get('EngineVersion', '')
        status = db_instance.get('DBInstanceStatus', 'N/A')

        metrics = {
            "engine": f"{engine} {engine_version}",
            "instanceClass": db_instance.get('DBInstanceClass', 'N/A'),
            "storage": f"{db_instance.get('AllocatedStorage', 0)} GB",
            "status": status,
            "multiAZ": db_instance.get('MultiAZ', False),
            "region": region,
            "securityScan": self._scan_rds(db_instance),
            "dbSubnetGroupVpcId": db_instance.get('DBSubnetGroup', {}).get('VpcId', '')
        }

        insights = f"{status.capitalize()} - {engine}"

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="rdsNode",
            name=db_id,
            service="rds",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights,
            parent_arn=subnet_arn
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": db_id,
            "raw_id": db_id,
            "parent_arn": subnet_arn
        }

    # ─────────────────────────────────────────
    # LAMBDA NORMALIZER
    # ─────────────────────────────────────────

    def normalize_lambda(
        self,
        function: dict,
        region: str,
        account_id: str,
        subnet_arn: Optional[str] = None
    ) -> dict:
        """
        Convert raw AWS Lambda response into standard node format.
        Parent is Subnet if Lambda is inside VPC.
        """
        function_name = function['FunctionName']
        resource_arn = function.get(
            'FunctionArn',
            f"arn:aws:lambda:{region}:{account_id}:function:{function_name}"
        )

        # Check if Lambda is inside VPC
        vpc_config = function.get('VpcConfig', {})
        subnet_ids = vpc_config.get('SubnetIds', [])
        security_group_ids = vpc_config.get('SecurityGroupIds', [])
        vpc_id = vpc_config.get('VpcId', '')
        in_vpc = len(subnet_ids) > 0

        metrics = {
            "runtime": function.get('Runtime', 'N/A'),
            "memory": f"{function.get('MemorySize', 128)} MB",
            "timeout": f"{function.get('Timeout', 3)}s",
            "iamRole": function.get('Role', 'N/A').split('/')[-1],
            "roleArn": function.get('Role', 'N/A'),
            "inVpc": in_vpc,
            "vpcId": vpc_id,
            "subnetIds": subnet_ids,
            "securityGroupIds": security_group_ids,
            "region": region,
            "securityScan": "Pass" if in_vpc else "Warning: Lambda not in VPC",
            "environment": function.get('Environment', {}),
            "eventSourceMappings": function.get('EventSourceMappings', []),
            "functionArn": resource_arn
        }

        insights = "Inside VPC" if in_vpc else "Public Lambda"
        node = self.build_node(
            resource_arn=resource_arn,
            node_type="lambdaNode",
            name=function_name,
            service="lambda",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights,
            parent_arn=subnet_arn
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": function_name,
            "raw_id": function_name,
            "parent_arn": subnet_arn
        }

    # ─────────────────────────────────────────
    # SQS NORMALIZER
    # ─────────────────────────────────────────

    def normalize_sqs(
        self,
        queue_url: str,
        attributes: dict,
        region: str,
        account_id: str
    ) -> dict:
        """
        Convert raw AWS SQS response into standard node format.
        SQS has no parent (not inside VPC).
        """
        queue_name = queue_url.split('/')[-1]
        resource_arn = attributes.get(
            'QueueArn',
            f"arn:aws:sqs:{region}:{account_id}:{queue_name}"
        )

        is_fifo = queue_name.endswith('.fifo')
        is_encrypted = 'SqsManagedSseEnabled' in attributes

        metrics = {
            "type": "FIFO" if is_fifo else "Standard",
            "visibilityTimeout": f"{attributes.get('VisibilityTimeout', 30)}s",
            "messageRetention": f"{int(attributes.get('MessageRetentionPeriod', 345600)) // 86400} days",
            "encrypted": is_encrypted,
            "region": region,
            "securityScan": "Pass: Encrypted" if is_encrypted else "Warning: Not encrypted"
        }

        insights = "FIFO Queue" if is_fifo else "Standard Queue"

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="sqsNode",
            name=queue_name,
            service="sqs",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": queue_name,
            "raw_id": queue_name
        }

    # ─────────────────────────────────────────
    # API GATEWAY NORMALIZER
    # ─────────────────────────────────────────

    def normalize_apigateway(
        self,
        api: dict,
        region: str,
        account_id: str
    ) -> dict:
        """
        Convert raw AWS API Gateway response into standard node format.
        API Gateway has no parent.
        """
        api_id = api.get('id') or api.get('ApiId')
        api_name = api.get('name') or api.get('Name', api_id)
        resource_arn = f"arn:aws:apigateway:{region}::/restapis/{api_id}"

        # REST vs HTTP API
        protocol = api.get('ProtocolType', 'REST')

        metrics = {
            "type": protocol,
            "apiId": api_id,
            "endpointType": api.get('EndpointConfiguration', {}).get('Types', ['REGIONAL'])[0]
                           if 'EndpointConfiguration' in api else 'HTTP',
            "region": region,
            "securityScan": "Pass",
            "integrations": api.get('Integrations', [])
        }

        insights = f"{protocol} API"

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="apiGatewayNode",
            name=api_name,
            service="apigateway",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights=insights
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": api_name,
            "raw_id": api_id
        }

    # ─────────────────────────────────────────
    # SECURITY SCAN HELPERS
    # ─────────────────────────────────────────

    def _scan_vpc(self, vpc: dict) -> str:
        if vpc.get('IsDefault'):
            return "Warning: Using default VPC"
        return "Pass"

    def _scan_rds(self, db: dict) -> str:
        if db.get('PubliclyAccessible'):
            return "Warning: Database is publicly accessible"
        if not db.get('MultiAZ'):
            return "Warning: Multi-AZ not enabled"
        return "Pass"

    def _scan_ec2(self, instance: dict) -> str:
        """Basic security checks for EC2 instance."""
        public_ip = instance.get('PublicIpAddress')
        state = instance.get('State', {}).get('Name', '')

        if public_ip and state == 'running':
            return "Warning: Instance has public IP"
        if state == 'stopped':
            return "Info: Instance is stopped"
        return "Pass"

    # ─────────────────────────────────────────
    # TAG HELPER
    # ─────────────────────────────────────────

    def _get_tag(self, resource: dict, key: str) -> Optional[str]:
        """Extract tag value from AWS tags list."""
        tags = resource.get('Tags', [])
        for tag in tags:
            if tag['Key'] == key:
                return tag['Value']
        return None

    # ─────────────────────────────────────────
    # EVENTBRIDGE NORMALIZER
    # ─────────────────────────────────────────

    def normalize_eventbridge(self, rule: dict, region: str, account_id: str) -> dict:
        """
        Convert raw AWS EventBridge rule response into standard node format.
        """
        rule_name = rule['Name']
        resource_arn = rule.get('Arn', f"arn:aws:events:{region}:{account_id}:rule/{rule_name}")

        metrics = {
            "ruleArn": resource_arn,
            "state": rule.get('State', 'ENABLED'),
            "scheduleExpression": rule.get('ScheduleExpression', ''),
            "eventPattern": rule.get('EventPattern', ''),
            "targets": rule.get('Targets', []),
            "region": region,
            "securityScan": "Pass"
        }

        node = self.build_node(
            resource_arn=resource_arn,
            node_type="eventbridgeNode",
            name=rule_name,
            service="eventbridge",
            region=region,
            account_id=account_id,
            metrics=metrics,
            insights="EventBridge Rule"
        )

        fingerprint = self.generate_fingerprint(metrics)

        return {
            "node": node,
            "fingerprint": fingerprint,
            "resource_arn": resource_arn,
            "resource_name": rule_name,
            "raw_id": rule_name
        }

    # ─────────────────────────────────────────
    # PASS 2 EXTENDED NORMALIZERS
    # ─────────────────────────────────────────

    def normalize_sns(self, topic_arn, endpoints, region, account_id):
        topic_name = topic_arn.split(":")[-1]
        metrics = {"endpoints": endpoints, "region": region}
        node = self.build_node(topic_arn, "snsNode", topic_name, "sns", region, account_id, metrics)
        return {"node": node, "resource_arn": topic_arn, "resource_name": topic_name, "raw_id": topic_arn}

    def normalize_alb(self, alb, target_groups, region, account_id):
        arn = alb['LoadBalancerArn']
        name = alb['LoadBalancerName']
        metrics = {
            "targetGroups": target_groups, 
            "region": region,
            "DNSName": alb.get('DNSName', '')
        }
        node = self.build_node(arn, "albNode", name, "alb", region, account_id, metrics)
        return {"node": node, "resource_arn": arn, "resource_name": name, "raw_id": arn}

    def normalize_ecs(self, task_def, region, account_id):
        arn = task_def['taskDefinitionArn']
        name = task_def.get('family', arn.split('/')[-1])
        secrets = []
        images = []
        logGroup = ""
        for c in task_def.get('containerDefinitions', []):
            secrets.extend(c.get('secrets', []))
            if 'image' in c: images.append(c['image'])
            lg = c.get('logConfiguration', {}).get('options', {}).get('awslogs-group')
            if lg: logGroup = lg
        metrics = {
            "taskRoleArn": task_def.get('taskRoleArn', ''),
            "executionRoleArn": task_def.get('executionRoleArn', ''),
            "secrets": secrets,
            "images": images,
            "logGroup": logGroup,
            "region": region
        }
        node = self.build_node(arn, "ecsNode", name, "ecs", region, account_id, metrics)
        return {"node": node, "resource_arn": arn, "resource_name": name, "raw_id": arn}

    def normalize_cloudfront(self, dist, region, account_id):
        arn = dist['ARN']
        name = dist['DomainName']
        origins = dist.get('Origins', {}).get('Items', [])
        metrics = {"origins": origins, "region": "global"}
        node = self.build_node(arn, "cloudfrontNode", name, "cloudfront", "global", account_id, metrics)
        return {"node": node, "resource_arn": arn, "resource_name": name, "raw_id": arn}

    def normalize_stepfunctions(self, detail, region, account_id):
        arn = detail['stateMachineArn']
        name = detail['name']
        try:
            states = json.loads(detail.get('definition', '{}')).get('States', {})
        except:
            states = {}
        metrics = {"states": states, "region": region}
        node = self.build_node(arn, "stepfunctionsNode", name, "stepfunctions", region, account_id, metrics)
        return {"node": node, "resource_arn": arn, "resource_name": name, "raw_id": arn}

    def normalize_secretsmanager(self, secret, region, account_id):
        arn = secret['ARN']
        name = secret['Name']
        metrics = {"rotationLambdaARN": secret.get('RotationLambdaARN', ''), "region": region}
        node = self.build_node(arn, "secretsmanagerNode", name, "secretsmanager", region, account_id, metrics)
        return {"node": node, "resource_arn": arn, "resource_name": name, "raw_id": arn}

    def normalize_eks(self, cluster, nodegroup_arns, region, account_id):
        arn = cluster.get('arn', f"arn:aws:eks:{region}:{account_id}:cluster/{cluster.get('name')}")
        name = cluster.get('name', 'eks')
        metrics = {
            "roleArn": cluster.get('roleArn', ''),
            "securityGroupIds": cluster.get('resourcesVpcConfig', {}).get('securityGroupIds', []),
            "nodegroupArns": nodegroup_arns,
            "region": region
        }
        node = self.build_node(arn, "eksNode", name, "eks", region, account_id, metrics)
        return {"node": node, "resource_arn": arn, "resource_name": name, "raw_id": arn}


# Single instance
normalizer = NormalizationEngine()