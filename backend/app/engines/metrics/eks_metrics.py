from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class EKSMetricsMapper(BaseMetricsMapper):
    SERVICE       = "eks"
    CW_NAMESPACE  = "AWS/EKS"

    METRICS_PLAN = []
    IGNORE_METRICS = []

    def map(self, raw: dict, period_hours: int) -> dict:
        return {}

    def telemetry_schema(self) -> list[dict]:
        return []


class EKSMetricsCollector(BaseMetricsCollector):
    SERVICE = "eks"

    def __init__(self):
        self.mapper = EKSMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        return [{"Name": "ClusterName", "Value": name}]
