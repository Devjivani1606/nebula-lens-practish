import boto3
import logging
from botocore.exceptions import ClientError
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class LambdaScanner:

    def scan(
        self,
        credentials: dict,
        region: str,
        account_id: str,
        subnet_map: dict = {}
    ) -> dict:
        """
        Scan all Lambda functions in a region.
        subnet_map: subnet_id → subnet_arn (for parent linking)
        """
        nodes = []
        edges = []
        errors = []

        try:
            lambda_client = boto3.client(
                'lambda',
                region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            paginator = lambda_client.get_paginator('list_functions')
            for page in paginator.paginate():
                for function in page['Functions']:
                    try:
                        # Fetch Event Source Mappings (triggers)
                        esm_list = []
                        try:
                            esm_res = lambda_client.list_event_source_mappings(FunctionName=function['FunctionName'])
                            for mapping in esm_res.get('EventSourceMappings', []):
                                esm_list.append({
                                    "eventSourceArn": mapping.get('EventSourceArn'),
                                    "state": mapping.get('State')
                                })
                        except Exception as esm_err:
                            logger.warning(f"Could not list event source mappings for {function['FunctionName']}: {esm_err}")
                        function['EventSourceMappings'] = esm_list

                        # Check if Lambda is in VPC
                        vpc_config = function.get('VpcConfig', {})
                        subnet_ids = vpc_config.get('SubnetIds', [])

                        # Use first subnet as parent
                        subnet_arn = None
                        if subnet_ids:
                            subnet_arn = subnet_map.get(subnet_ids[0])

                        result = normalizer.normalize_lambda(
                            function=function,
                            region=region,
                            account_id=account_id,
                            subnet_arn=subnet_arn
                        )
                        nodes.append(result)

                        # NOTE: We do NOT create Subnet→Lambda edges here.
                        # VPC/Subnet hierarchy is handled via parentId (React Flow nesting).
                        # Only real communication edges are created by the RelationshipEngine.
                        logger.info(f"Lambda scanned: {function['FunctionName']}")

                    except Exception as e:
                        errors.append(f"Lambda error: {str(e)}")

        except Exception as e:
            errors.append(f"Lambda scanner error: {str(e)}")

        return {
            "nodes": nodes,
            "edges": edges,
            "errors": errors,
            "service": "lambda",
            "region": region
        }


lambda_scanner = LambdaScanner()