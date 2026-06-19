import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class APIGatewayScanner:

    def scan(
        self,
        credentials: dict,
        region: str,
        account_id: str
    ) -> dict:
        nodes = []
        edges = []
        errors = []

        try:
            # REST APIs
            apigw = boto3.client(
                'apigateway',
                region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            response = apigw.get_rest_apis()
            for api in response.get('items', []):
                try:
                    integrations = []
                    try:
                        resources = apigw.get_resources(restApiId=api['id'], limit=500)
                        for item in resources.get('items', []):
                            methods = item.get('resourceMethods', {})
                            for method in methods.keys():
                                try:
                                    integration = apigw.get_integration(
                                        restApiId=api['id'],
                                        resourceId=item['id'],
                                        httpMethod=method
                                    )
                                    uri = integration.get('uri')
                                    if uri:
                                        integrations.append(uri)
                                except Exception:
                                    pass
                    except Exception as api_err:
                        logger.warning(f"Error fetching resources/integrations for API Gateway {api['id']}: {api_err}")

                    api['Integrations'] = integrations

                    result = normalizer.normalize_apigateway(
                        api=api,
                        region=region,
                        account_id=account_id
                    )
                    nodes.append(result)
                    logger.info(f"API Gateway scanned: {api.get('name')}")
                except Exception as e:
                    errors.append(f"API Gateway error: {str(e)}")

        except Exception as e:
            errors.append(f"API Gateway scanner error: {str(e)}")

        return {
            "nodes": nodes,
            "edges": edges,
            "errors": errors,
            "service": "apigateway",
            "region": region
        }


apigateway_scanner = APIGatewayScanner()