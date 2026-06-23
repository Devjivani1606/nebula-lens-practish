from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class ECSCostCalculator(BaseCostCalculator):

    SERVICE = "ecs"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        metrics = node.get("data", {}).get("metrics", {})
        running_tasks = metrics_summary.get("runningTasks", 0) or metrics.get("runningTasksCount", 0) or 0

        # Standard average Fargate task sizing: 0.25 vCPU and 0.5 GB memory
        task_vcpu = 0.25
        task_memory_gb = 0.5

        monthly_vcpu_hours = running_tasks * 730 * task_vcpu
        monthly_memory_hours = running_tasks * 730 * task_memory_gb

        # Fetch Fargate dynamic pricing
        price_per_vcpu_hour = pricing_service.get("ecs", region, "fargate_vcpu", credentials) or 0.04048
        price_per_gb_hour = pricing_service.get("ecs", region, "fargate_memory", credentials) or 0.004445

        line_items = [
            self._line(
                "Fargate vCPU Compute Hours",
                monthly_vcpu_hours,
                "vCPU-hours",
                price_per_vcpu_hour
            ),
            self._line(
                "Fargate Memory Hours",
                monthly_memory_hours,
                "GB-hours",
                price_per_gb_hour
            )
        ]

        return self._build_result(
            billing_model="pay-per-use",
            dimensions={
                "runningTasks": running_tasks,
                "taskVCPU": task_vcpu,
                "taskMemoryGB": task_memory_gb,
                "monthlyVCPUHours": monthly_vcpu_hours,
                "monthlyMemoryGBHours": monthly_memory_hours
            },
            line_items=line_items,
            region=region,
            notes=f"Estimated monthly Fargate compute cost for ECS Cluster {node.get('data', {}).get('name', 'Cluster')} in {region}"
        )
