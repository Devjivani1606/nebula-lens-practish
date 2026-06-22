import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class CloudFrontScanner:

    def scan(self, credentials: dict, account_id: str) -> dict:
        """CloudFront is global — no region needed."""
        nodes = []
        errors = []

        try:
            cf = boto3.client(
                'cloudfront',
                region_name='us-east-1',  # CloudFront API is always us-east-1
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            paginator = cf.get_paginator('list_distributions')
            for page in paginator.paginate():
                dist_list = page.get('DistributionList', {})
                for dist in dist_list.get('Items', []):
                    try:
                        result = normalizer.normalize_cloudfront(
                            distribution=dist,
                            account_id=account_id
                        )
                        nodes.append(result)
                        logger.info(f"CloudFront scanned: {dist['Id']}")
                    except Exception as e:
                        errors.append(f"CloudFront dist error: {str(e)}")

        except Exception as e:
            errors.append(f"CloudFront scanner error: {str(e)}")

        return {"nodes": nodes, "edges": [], "errors": errors, "service": "cloudfront", "region": "global"}


cloudfront_scanner = CloudFrontScanner()
