import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class DynamoDBScanner:

    def scan(self, credentials: dict, region: str, account_id: str) -> dict:
        nodes = []
        errors = []

        try:
            ddb = boto3.client(
                'dynamodb', region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            paginator = ddb.get_paginator('list_tables')
            for page in paginator.paginate():
                for table_name in page.get('TableNames', []):
                    try:
                        desc = ddb.describe_table(TableName=table_name)
                        table = desc['Table']

                        result = normalizer.normalize_dynamodb(
                            table=table,
                            region=region,
                            account_id=account_id
                        )
                        nodes.append(result)
                        logger.info(f"DynamoDB scanned: {table_name}")
                    except Exception as e:
                        errors.append(f"DynamoDB table error: {str(e)}")

        except Exception as e:
            errors.append(f"DynamoDB scanner error: {str(e)}")

        return {"nodes": nodes, "edges": [], "errors": errors, "service": "dynamodb", "region": region}


dynamodb_scanner = DynamoDBScanner()
