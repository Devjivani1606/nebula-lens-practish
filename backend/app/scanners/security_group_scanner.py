import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class SecurityGroupScanner:

    def scan(self, credentials: dict, region: str, account_id: str) -> dict:
        nodes = []
        errors = []

        try:
            ec2 = boto3.client(
                'ec2', region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            paginator = ec2.get_paginator('describe_security_groups')
            for page in paginator.paginate():
                for sg in page.get('SecurityGroups', []):
                    try:
                        result = normalizer.normalize_security_group(
                            sg=sg,
                            region=region,
                            account_id=account_id
                        )
                        nodes.append(result)
                        logger.info(f"SecurityGroup scanned: {sg['GroupId']}")
                    except Exception as e:
                        errors.append(f"SecurityGroup error: {str(e)}")

        except Exception as e:
            errors.append(f"SecurityGroup scanner error: {str(e)}")

        return {"nodes": nodes, "edges": [], "errors": errors, "service": "securitygroup", "region": region}


security_group_scanner = SecurityGroupScanner()
