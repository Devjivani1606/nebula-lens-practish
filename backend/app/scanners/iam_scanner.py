import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class IAMScanner:

    def scan(self, credentials: dict, region: str, account_id: str) -> dict:
        """IAM is global — scan roles with attached policies."""
        nodes = []
        errors = []

        try:
            iam = boto3.client(
                'iam',
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            paginator = iam.get_paginator('list_roles')
            for page in paginator.paginate():
                for role in page.get('Roles', []):
                    try:
                        role_arn = role['Arn']
                        role_name = role['RoleName']

                        # Get attached managed policies
                        attached = []
                        try:
                            ap = iam.list_attached_role_policies(RoleName=role_name)
                            attached = ap.get('AttachedPolicies', [])
                        except Exception:
                            pass

                        # Get inline policy names
                        inline = []
                        try:
                            ip = iam.list_role_policies(RoleName=role_name)
                            inline = ip.get('PolicyNames', [])
                        except Exception:
                            pass

                        result = normalizer.normalize_iam_role(
                            role=role,
                            attached_policies=attached,
                            inline_policies=inline,
                            region=region,
                            account_id=account_id
                        )
                        nodes.append(result)
                        logger.info(f"IAM Role scanned: {role_name}")
                    except Exception as e:
                        errors.append(f"IAM role error: {str(e)}")

        except Exception as e:
            errors.append(f"IAM scanner error: {str(e)}")

        return {"nodes": nodes, "edges": [], "errors": errors, "service": "iam", "region": "global"}


iam_scanner = IAMScanner()
