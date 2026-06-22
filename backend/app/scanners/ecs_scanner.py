import boto3
import logging
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)


class ECSScanner:

    def scan(self, credentials: dict, region: str, account_id: str, subnet_map: dict = {}) -> dict:
        nodes = []
        errors = []

        try:
            ecs = boto3.client(
                'ecs', region_name=region,
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            # List clusters
            cluster_arns = []
            paginator = ecs.get_paginator('list_clusters')
            for page in paginator.paginate():
                cluster_arns.extend(page.get('clusterArns', []))

            if not cluster_arns:
                return {"nodes": nodes, "edges": [], "errors": errors, "service": "ecs", "region": region}

            # Describe clusters in batches of 100
            for i in range(0, len(cluster_arns), 100):
                batch = cluster_arns[i:i + 100]
                desc = ecs.describe_clusters(clusters=batch, include=['TAGS'])
                for cluster in desc.get('clusters', []):
                    cluster_arn = cluster['clusterArn']
                    try:
                        # List services in this cluster
                        services_data = []
                        svc_paginator = ecs.get_paginator('list_services')
                        svc_arns = []
                        for svc_page in svc_paginator.paginate(cluster=cluster_arn):
                            svc_arns.extend(svc_page.get('serviceArns', []))

                        # Describe services in batches of 10 (AWS limit)
                        for j in range(0, len(svc_arns), 10):
                            svc_batch = svc_arns[j:j + 10]
                            svc_desc = ecs.describe_services(cluster=cluster_arn, services=svc_batch)
                            for svc in svc_desc.get('services', []):
                                # Get task definition for image/role info
                                td_info = {}
                                try:
                                    td_arn = svc.get('taskDefinition', '')
                                    if td_arn:
                                        td_resp = ecs.describe_task_definition(taskDefinition=td_arn)
                                        td_info = td_resp.get('taskDefinition', {})
                                except Exception:
                                    pass
                                services_data.append({**svc, "taskDefinitionDetail": td_info})

                        result = normalizer.normalize_ecs_cluster(
                            cluster=cluster,
                            services=services_data,
                            region=region,
                            account_id=account_id,
                            subnet_map=subnet_map
                        )
                        nodes.append(result)
                        logger.info(f"ECS cluster scanned: {cluster['clusterName']}")
                    except Exception as e:
                        errors.append(f"ECS cluster error {cluster_arn}: {str(e)}")

        except Exception as e:
            errors.append(f"ECS scanner error: {str(e)}")

        return {"nodes": nodes, "edges": [], "errors": errors, "service": "ecs", "region": region}


ecs_scanner = ECSScanner()
