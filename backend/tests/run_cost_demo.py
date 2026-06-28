import json
from app.engines.cost_engine import cost_engine
from app.engines.pricing.pricing_cache import pricing_cache

# Seed the cache with representative prices so we can run offline without live credentials
pricing_cache.set("rds", "ap-south-1", "instance:db.t3.medium:PostgreSQL:Single-AZ", 0.035)
pricing_cache.set("rds", "ap-south-1", "storage:gp2", 0.115)
pricing_cache.set("sns", "ap-south-1", "requests:standard", 0.50)
pricing_cache.set("dynamodb", "ap-south-1", "storage", 0.25)
pricing_cache.set("dynamodb", "ap-south-1", "rru", 0.25)
pricing_cache.set("dynamodb", "ap-south-1", "wru", 1.25)
pricing_cache.set("dynamodb", "ap-south-1", "rcu_hourly", 0.00013)
pricing_cache.set("dynamodb", "ap-south-1", "wcu_hourly", 0.00065)
pricing_cache.set("cloudfront", "ap-south-1", "requests", 0.0075)
pricing_cache.set("cloudfront", "ap-south-1", "transfer", 0.085)
pricing_cache.set("ecs", "ap-south-1", "fargate_vcpu", 0.04048)
pricing_cache.set("ecs", "ap-south-1", "fargate_memory", 0.004445)

# Define mock nodes for the 5 new services
nodes = [
    # RDS Node
    {
        "id": "arn:aws:rds:ap-south-1:123456789012:db:my-rds-database",
        "data": {
            "name": "my-rds-database",
            "service": "rds",
            "metrics": {
                "instanceClass": "db.t3.medium",
                "storage": "100 GB",
                "multiAZ": False,
                "engine": "PostgreSQL"
            }
        }
    },
    # SNS Node
    {
        "id": "arn:aws:sns:ap-south-1:123456789012:my-sns-topic",
        "data": {
            "name": "my-sns-topic",
            "service": "sns",
            "metrics": {
                "type": "Standard"
            }
        }
    },
    # DynamoDB Node (On-Demand)
    {
        "id": "arn:aws:dynamodb:ap-south-1:123456789012:table/my-dynamo-table",
        "data": {
            "name": "my-dynamo-table",
            "service": "dynamodb",
            "metrics": {
                "billingMode": "PAY_PER_REQUEST",
                "sizeBytes": 30 * (1024 ** 3)  # 30 GB
            }
        }
    },
    # CloudFront Node
    {
        "id": "arn:aws:cloudfront::123456789012:distribution/EDFGHJK789",
        "data": {
            "name": "my-cloudfront-cdn",
            "service": "cloudfront"
        }
    },
    # ECS Fargate Node
    {
        "id": "arn:aws:ecs:ap-south-1:123456789012:cluster/my-ecs-cluster",
        "data": {
            "name": "my-ecs-cluster",
            "service": "ecs",
            "metrics": {
                "runningTasksCount": 2
            }
        }
    }
]

# Define 24-hour metric collections that will be extrapolated to a month
metrics_results = {
    "arn:aws:rds:ap-south-1:123456789012:db:my-rds-database": {
        "summary": {}
    },
    "arn:aws:sns:ap-south-1:123456789012:my-sns-topic": {
        "summary": {
            "messagesPublished": 50000  # 50k publishes per day -> 1.5M per month
        }
    },
    "arn:aws:dynamodb:ap-south-1:123456789012:table/my-dynamo-table": {
        "summary": {
            "consumedReadUnits": 100000,
            "consumedWriteUnits": 50000
        }
    },
    "arn:aws:cloudfront::123456789012:distribution/EDFGHJK789": {
        "summary": {
            "requests": 100000,
            "bytesDownloaded": 10 * (1024 ** 3)  # 10 GB downloaded per day
        }
    },
    "arn:aws:ecs:ap-south-1:123456789012:cluster/my-ecs-cluster": {
        "summary": {
            "runningTasks": 2
        }
    }
}

# Run through the Pluggable Cost Engine
costs = cost_engine.calculate_all(nodes, metrics_results, "ap-south-1")

# Format output beautifully
print("\n" + "=" * 85)
print("                     AWS SERVICES MONTHLY COST ESTIMATOR DEMO")
print("=" * 85)

for arn, res in costs.items():
    print(f"\n* Resource Name: {res.get('notes').split('for ')[-1].split(' in')[0]}")
    print(f"   ARN:           {arn}")
    print(f"   AWS Service:   {res.get('service').upper()}")
    print(f"   Billing Model: {res.get('billingModel')}")
    print(f"   Monthly Cost:  ${res.get('monthlyCost')} USD")
    print(f"   Yearly Cost:   ${res.get('yearlyCost')} USD")
    print(f"   Details:       {res.get('notes')}")
    print("   Line Items:")
    for item in res.get("lineItems", []):
        print(
            f"     - {item.get('description'):<50} | Qty: {item.get('quantity'):<8} | Price: ${item.get('unitPrice'):<8} | Cost: ${item.get('cost'):.4f}"
        )
    print("-" * 85)
