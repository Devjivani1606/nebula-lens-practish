import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class SQSScanner:

    def scan(
        self,
        credentials: dict,
        region: str,
        account_id: str
    ) -> dict:
        nodes = []
        errors = []

        try:
            sqs = boto3.client(
                'sqs',
                region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            response = sqs.list_queues()
            queue_urls = response.get('QueueUrls', [])

            for queue_url in queue_urls:
                try:
                    attrs = sqs.get_queue_attributes(
                        QueueUrl=queue_url,
                        AttributeNames=['All']
                    )
                    attributes = attrs.get('Attributes', {})

                    result = normalizer.normalize_sqs(
                        queue_url=queue_url,
                        attributes=attributes,
                        region=region,
                        account_id=account_id
                    )
                    nodes.append(result)
                    logger.info(f"SQS scanned: {queue_url.split('/')[-1]}")

                except Exception as e:
                    errors.append(f"SQS queue error: {str(e)}")

        except Exception as e:
            errors.append(f"SQS scanner error: {str(e)}")

        return {
            "nodes": nodes,
            "edges": [],
            "errors": errors,
            "service": "sqs",
            "region": region
        }


sqs_scanner = SQSScanner()