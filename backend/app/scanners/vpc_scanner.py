import boto3
import logging
from botocore.exceptions import ClientError
from typing import Optional
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class VPCScanner:

    def scan(
        self,
        credentials: dict,
        region: str,
        account_id: str
    ) -> dict:
        """
        Scan all VPCs and Subnets in a region.
        Returns nodes and edges in React Flow format.
        """
        nodes = []
        edges = []
        errors = []

        try:
            ec2 = boto3.client(
                'ec2',
                region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            # Scan VPC Endpoints
            vpc_endpoints = {}
            try:
                endpoints_res = ec2.describe_vpc_endpoints()
                for endpoint in endpoints_res.get('VpcEndpoints', []):
                    vid = endpoint.get('VpcId')
                    if vid not in vpc_endpoints:
                        vpc_endpoints[vid] = []
                    vpc_endpoints[vid].append({
                        "vpcEndpointId": endpoint.get('VpcEndpointId'),
                        "vpcId": vid,
                        "serviceName": endpoint.get('ServiceName'),
                        "vpcEndpointType": endpoint.get('VpcEndpointType'),
                        "routeTableIds": endpoint.get('RouteTableIds', [])
                    })
            except Exception as e:
                logger.warning(f"Failed to scan VPC endpoints: {e}")

            # Scan Security Groups and rules
            vpc_security_groups = {}
            try:
                paginator = ec2.get_paginator('describe_security_groups')
                for page in paginator.paginate():
                    for sg in page.get('SecurityGroups', []):
                        vid = sg.get('VpcId')
                        if vid not in vpc_security_groups:
                            vpc_security_groups[vid] = []
                        vpc_security_groups[vid].append({
                            "groupId": sg.get('GroupId'),
                            "groupName": sg.get('GroupName'),
                            "ipPermissions": [
                                {
                                    "fromPort": rule.get('FromPort'),
                                    "toPort": rule.get('ToPort'),
                                    "ipProtocol": rule.get('IpProtocol'),
                                    "userIdGroupPairs": [
                                        {"groupId": pair.get('GroupId')}
                                        for pair in rule.get('UserIdGroupPairs', [])
                                    ]
                                } for rule in sg.get('IpPermissions', [])
                            ],
                            "ipPermissionsEgress": [
                                {
                                    "fromPort": rule.get('FromPort'),
                                    "toPort": rule.get('ToPort'),
                                    "ipProtocol": rule.get('IpProtocol'),
                                    "userIdGroupPairs": [
                                        {"groupId": pair.get('GroupId')}
                                        for pair in rule.get('UserIdGroupPairs', [])
                                    ]
                                } for rule in sg.get('IpPermissionsEgress', [])
                            ]
                        })
            except Exception as e:
                logger.warning(f"Failed to scan security groups: {e}")

            # Scan Route Tables
            vpc_route_tables = {}
            try:
                paginator = ec2.get_paginator('describe_route_tables')
                for page in paginator.paginate():
                    for rt in page.get('RouteTables', []):
                        vid = rt.get('VpcId')
                        if vid not in vpc_route_tables:
                            vpc_route_tables[vid] = []
                        vpc_route_tables[vid].append({
                            "routeTableId": rt.get('RouteTableId'),
                            "routes": [
                                {
                                    "destinationCidrBlock": r.get('DestinationCidrBlock'),
                                    "gatewayId": r.get('GatewayId'),
                                    "natGatewayId": r.get('NatGatewayId')
                                } for r in rt.get('Routes', [])
                            ]
                        })
            except Exception as e:
                logger.warning(f"Failed to scan route tables: {e}")

            # Scan ENIs (Network Interfaces)
            vpc_enis = {}
            try:
                paginator = ec2.get_paginator('describe_network_interfaces')
                for page in paginator.paginate():
                    for eni in page.get('NetworkInterfaces', []):
                        vid = eni.get('VpcId')
                        if vid not in vpc_enis:
                            vpc_enis[vid] = []
                        vpc_enis[vid].append({
                            "networkInterfaceId": eni.get('NetworkInterfaceId'),
                            "subnetId": eni.get('SubnetId'),
                            "vpcId": vid,
                            "securityGroupIds": [sg.get('GroupId') for sg in eni.get('Groups', [])],
                            "attachment": {
                                "instanceId": eni.get('Attachment', {}).get('InstanceId')
                            } if eni.get('Attachment') else None
                        })
            except Exception as e:
                logger.warning(f"Failed to scan ENIs: {e}")

            # ── Scan VPCs ──────────────────────────
            vpc_map = {}  # vpc_id → vpc_arn

            paginator = ec2.get_paginator('describe_vpcs')
            for page in paginator.paginate():
                for vpc in page['Vpcs']:
                    try:
                        endpoints = vpc_endpoints.get(vpc['VpcId'], [])
                        security_groups = vpc_security_groups.get(vpc['VpcId'], [])
                        route_tables = vpc_route_tables.get(vpc['VpcId'], [])
                        enis = vpc_enis.get(vpc['VpcId'], [])
                        result = normalizer.normalize_vpc(
                            vpc=vpc,
                            region=region,
                            account_id=account_id,
                            endpoints=endpoints,
                            security_groups=security_groups,
                            route_tables=route_tables,
                            enis=enis
                        )
                        nodes.append(result)
                        vpc_map[result['raw_id']] = result['resource_arn']
                        logger.info(f"VPC scanned: {result['raw_id']}")
                    except Exception as e:
                        errors.append(f"VPC error: {str(e)}")

            # ── Scan Subnets ────────────────────────
            paginator = ec2.get_paginator('describe_subnets')
            for page in paginator.paginate():
                for subnet in page['Subnets']:
                    try:
                        vpc_id = subnet['VpcId']
                        vpc_arn = vpc_map.get(vpc_id)

                        result = normalizer.normalize_subnet(
                            subnet, region, account_id,
                            vpc_arn=vpc_arn
                        )
                        nodes.append(result)

                        # Create edge: VPC → Subnet
                        if vpc_arn:
                            edge = normalizer.build_edge(
                                source_arn=vpc_arn,
                                target_arn=result['resource_arn'],
                                label="contains"
                            )
                            edges.append(edge)

                        logger.info(f"Subnet scanned: {result['raw_id']}")
                    except Exception as e:
                        errors.append(f"Subnet error: {str(e)}")

        except ClientError as e:
            errors.append(f"AWS ClientError: {str(e)}")
        except Exception as e:
            errors.append(f"Scanner error: {str(e)}")

        return {
            "nodes": nodes,
            "edges": edges,
            "errors": errors,
            "service": "vpc+subnet",
            "region": region
        }


vpc_scanner = VPCScanner()