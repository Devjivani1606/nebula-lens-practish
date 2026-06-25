from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class SecretsManagerMetricsMapper(BaseMetricsMapper):
    SERVICE       = "secretsmanager"
    CW_NAMESPACE  = "AWS/SecretsManager"

    METRICS_PLAN = [
        MetricQuery("call_count", "CallCount", stat="Sum", for_telemetry=True)
    ]
    IGNORE_METRICS = []

    def map(self, raw: dict, period_hours: int) -> dict:
        calls = raw.get("call_count", [])
        return {
            "apiCalls": int(self._sum(calls))
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "call_count", "label": "API Call Count", "unit": "Count", "chart": "bar"}
        ]


class SecretsManagerMetricsCollector(BaseMetricsCollector):
    SERVICE = "secretsmanager"

    def __init__(self):
        self.mapper = SecretsManagerMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        return [{"Name": "SecretId", "Value": name}]
