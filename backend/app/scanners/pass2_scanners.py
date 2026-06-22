import boto3
import json
import logging
from botocore.config import Config
from app.engines.normalizer import normalizer

logger = logging.getLogger(__name__)

retry_config = Config(
    retries={
        'max_attempts': 10,
        'mode': 'adaptive'
    }
)

class Pass2Scanners:
    """Extended config collectors for Pass 2 missing services."""

    def _get_boto(self, service, region, creds):
        return boto3.client(
            service, region_name=region,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'],
            config=retry_config
        )

    def scan_sns(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            sns = self._get_boto('sns', region, credentials)
            
            topics = []
            paginator = sns.get_paginator('list_topics')
            for page in paginator.paginate():
                topics.extend(page.get('Topics', []))
                
            all_subs = []
            sub_paginator = sns.get_paginator('list_subscriptions')
            for page in sub_paginator.paginate():
                all_subs.extend(page.get('Subscriptions', []))
                
            subs_by_topic = {}
            for sub in all_subs:
                t_arn = sub.get('TopicArn')
                if not t_arn: continue
                if t_arn not in subs_by_topic:
                    subs_by_topic[t_arn] = {"Lambda": [], "SQS": []}
                if sub['Protocol'] == 'lambda':
                    subs_by_topic[t_arn]["Lambda"].append(sub['Endpoint'])
                elif sub['Protocol'] == 'sqs':
                    subs_by_topic[t_arn]["SQS"].append(sub['Endpoint'])
                    
            for t in topics:
                arn = t['TopicArn']
                endpoints = subs_by_topic.get(arn, {"Lambda": [], "SQS": []})
                nodes.append(normalizer.normalize_sns_endpoints(arn, endpoints, region, account_id))
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

    def scan_alb(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            elbv2 = self._get_boto('elbv2', region, credentials)
            
            albs = []
            alb_paginator = elbv2.get_paginator('describe_load_balancers')
            for page in alb_paginator.paginate():
                albs.extend(page.get('LoadBalancers', []))
            
            for alb in albs:
                arn = alb['LoadBalancerArn']
                
                tgs = []
                tg_paginator = elbv2.get_paginator('describe_target_groups')
                for page in tg_paginator.paginate(LoadBalancerArn=arn):
                    tgs.extend(page.get('TargetGroups', []))
                
                target_groups_data = []
                for tg in tgs:
                    tg_arn = tg['TargetGroupArn']
                    try:
                        healths = elbv2.describe_target_health(TargetGroupArn=tg_arn).get('TargetHealthDescriptions', [])
                        targets = [{"Id": h['Target']['Id']} for h in healths]
                    except:
                        targets = []
                    target_groups_data.append({"TargetGroupArn": tg_arn, "Targets": targets})
                nodes.append(normalizer.normalize_alb(alb, target_groups_data, region, account_id))
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

    def scan_ecs(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            ecs = self._get_boto('ecs', region, credentials)
            
            clusters = []
            clusters_paginator = ecs.get_paginator('list_clusters')
            for page in clusters_paginator.paginate():
                clusters.extend(page.get('clusterArns', []))
                
            unique_task_defs = set()
            for cluster in clusters:
                tasks = []
                tasks_paginator = ecs.get_paginator('list_tasks')
                for page in tasks_paginator.paginate(cluster=cluster):
                    tasks.extend(page.get('taskArns', []))
                    
                if tasks:
                    for i in range(0, len(tasks), 100):
                        chunk = tasks[i:i+100]
                        task_details = ecs.describe_tasks(cluster=cluster, tasks=chunk).get('tasks', [])
                        for t in task_details:
                            unique_task_defs.add(t['taskDefinitionArn'])
                            
            for td_arn in unique_task_defs:
                try:
                    td = ecs.describe_task_definition(taskDefinition=td_arn).get('taskDefinition', {})
                    nodes.append(normalizer.normalize_ecs(td, region, account_id))
                except Exception:
                    pass
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

    def scan_cloudfront(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            cf = self._get_boto('cloudfront', region, credentials)
            
            dists = []
            paginator = cf.get_paginator('list_distributions')
            for page in paginator.paginate():
                dists.extend(page.get('DistributionList', {}).get('Items', []))
                
            for d in dists:
                nodes.append(normalizer.normalize_cloudfront(d, region, account_id))
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

    def scan_stepfunctions(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            sfn = self._get_boto('stepfunctions', region, credentials)
            
            sms = []
            paginator = sfn.get_paginator('list_state_machines')
            for page in paginator.paginate():
                sms.extend(page.get('stateMachines', []))
                
            for sm in sms:
                arn = sm['stateMachineArn']
                detail = sfn.describe_state_machine(stateMachineArn=arn)
                nodes.append(normalizer.normalize_stepfunctions(detail, region, account_id))
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

    def scan_secretsmanager(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            sm = self._get_boto('secretsmanager', region, credentials)
            
            secrets = []
            paginator = sm.get_paginator('list_secrets')
            for page in paginator.paginate():
                secrets.extend(page.get('SecretList', []))
                
            for secret in secrets:
                nodes.append(normalizer.normalize_secretsmanager(secret, region, account_id))
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

    def scan_eks(self, credentials, region, account_id):
        nodes, edges, errors = [], [], []
        try:
            eks = self._get_boto('eks', region, credentials)
            
            clusters = []
            paginator = eks.get_paginator('list_clusters')
            for page in paginator.paginate():
                clusters.extend(page.get('clusters', []))
                
            for cluster_name in clusters:
                c = eks.describe_cluster(name=cluster_name).get('cluster', {})
                
                ngs = []
                ng_paginator = eks.get_paginator('list_nodegroups')
                for page in ng_paginator.paginate(clusterName=cluster_name):
                    ngs.extend(page.get('nodegroups', []))
                    
                ng_arns = []
                for ng in ngs:
                    ng_detail = eks.describe_nodegroup(clusterName=cluster_name, nodegroupName=ng).get('nodegroup', {})
                    if ng_detail.get('nodegroupArn'):
                        ng_arns.append(ng_detail.get('nodegroupArn'))
                nodes.append(normalizer.normalize_eks(c, ng_arns, region, account_id))
        except Exception as e:
            errors.append(str(e))
        return {"nodes": nodes, "edges": edges, "errors": errors}

pass2_scanners = Pass2Scanners()
