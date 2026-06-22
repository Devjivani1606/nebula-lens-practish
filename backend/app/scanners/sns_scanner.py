import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class SNSScanner:

    def scan(self, credentials: dict, region: str, account_id: str) -> dict:
        nodes = []
        errors = []

        try:
            sns = boto3.client(
                'sns', region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            paginator = sns.get_paginator('list_topics')
            for page in paginator.paginate():
                for topic in page.get('Topics', []):
                    topic_arn = topic['TopicArn']
                    try:
                        attrs = sns.get_topic_attributes(TopicArn=topic_arn)
                        attributes = attrs.get('Attributes', {})

                        # Fetch subscriptions to discover relationships
                        subs = []
                        try:
                            sub_res = sns.list_subscriptions_by_topic(TopicArn=topic_arn)
                            subs = sub_res.get('Subscriptions', [])
                        except Exception:
                            pass

                        result = normalizer.normalize_sns(
                            topic_arn=topic_arn,
                            attributes=attributes,
                            subscriptions=subs,
                            region=region,
                            account_id=account_id
                        )
                        nodes.append(result)
                        logger.info(f"SNS scanned: {topic_arn.split(':')[-1]}")
                    except Exception as e:
                        errors.append(f"SNS topic error: {str(e)}")

        except Exception as e:
            errors.append(f"SNS scanner error: {str(e)}")

        return {"nodes": nodes, "edges": [], "errors": errors, "service": "sns", "region": region}


sns_scanner = SNSScanner()
