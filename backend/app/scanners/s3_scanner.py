import boto3
import logging
from botocore.exceptions import ClientError
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class S3Scanner:

    def scan(
        self,
        credentials: dict,
        account_id: str
    ) -> dict:
        """
        Scan all S3 buckets.
        S3 is global — no region loop needed.
        """
        nodes = []
        errors = []

        try:
            s3 = boto3.client(
                's3',
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            response = s3.list_buckets()

            for bucket in response.get('Buckets', []):
                try:
                    bucket_name = bucket['Name']

                    # Get bucket region
                    try:
                        loc = s3.get_bucket_location(Bucket=bucket_name)
                        region = loc.get('LocationConstraint') or 'us-east-1'
                    except Exception:
                        region = 'us-east-1'

                    # Get public access block
                    try:
                        pub = s3.get_public_access_block(Bucket=bucket_name)
                        public_access = pub.get('PublicAccessBlockConfiguration', {})
                    except Exception:
                        public_access = {}

                    # Get versioning
                    try:
                        ver = s3.get_bucket_versioning(Bucket=bucket_name)
                        versioning = ver.get('Status', 'Disabled')
                    except Exception:
                        versioning = 'Disabled'

                    # Get bucket notification configuration
                    notification_config = {}
                    try:
                        notif = s3.get_bucket_notification_configuration(Bucket=bucket_name)
                        notification_config = {
                            "LambdaFunctionConfigurations": [
                                {
                                    "LambdaFunctionArn": cfg.get('LambdaFunctionArn'),
                                    "Events": cfg.get('Events')
                                } for cfg in notif.get('LambdaFunctionConfigurations', [])
                            ]
                        }
                    except Exception as notif_err:
                        logger.warning(f"Could not list notification configuration for {bucket_name}: {notif_err}")

                    result = normalizer.normalize_s3(
                        bucket=bucket,
                        account_id=account_id,
                        location=region,
                        public_access=public_access,
                        versioning=versioning,
                        notification_config=notification_config
                    )
                    nodes.append(result)
                    logger.info(f"S3 scanned: {bucket_name}")

                except Exception as e:
                    errors.append(f"S3 bucket error: {str(e)}")

        except Exception as e:
            errors.append(f"S3 scanner error: {str(e)}")

        return {
            "nodes": nodes,
            "edges": [],
            "errors": errors,
            "service": "s3"
        }


s3_scanner = S3Scanner()