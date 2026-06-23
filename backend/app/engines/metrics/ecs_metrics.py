from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class ECSMetricsMapper(BaseMetricsMapper):
    SERVICE       = "ecs"
    CW_NAMESPACE  = "AWS/ECS"

    METRICS_PLAN = [
        MetricQuery("cpu_utilization",    "CPUUtilization",    stat="Average", for_telemetry=True),
        MetricQuery("memory_utilization", "MemoryUtilization", stat="Average", for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "GPUUtilization",
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        cpu_dps  = raw.get("cpu_utilization", [])
        mem_dps  = raw.get("memory_utilization", [])

        running_tasks = getattr(self, "_running_tasks_count", 0)

        return {
            "cpuUtilization":    round(self._avg(cpu_dps), 2),
            "memoryUtilization": round(self._avg(mem_dps), 2),
            "runningTasks":      int(running_tasks),
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "cpu_utilization",    "label": "Cluster CPU Utilization",    "unit": "Percent", "chart": "line"},
            {"key": "memory_utilization", "label": "Cluster Memory Utilization", "unit": "Percent", "chart": "line"},
        ]


class ECSMetricsCollector(BaseMetricsCollector):
    SERVICE = "ecs"

    def __init__(self):
        self.mapper = ECSMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        cluster_name = name or arn.split("/")[-1]
        if not cluster_name:
            raise ValueError("Cannot determine ECS cluster name")

        running_tasks = node.get("data", {}).get("metrics", {}).get("runningTasksCount", 0)
        self.mapper._running_tasks_count = running_tasks

        return [{"Name": "ClusterName", "Value": cluster_name}]
