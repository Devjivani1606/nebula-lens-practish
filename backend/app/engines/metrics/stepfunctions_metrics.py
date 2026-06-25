from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class StepFunctionsMetricsMapper(BaseMetricsMapper):
    SERVICE       = "stepfunctions"
    CW_NAMESPACE  = "AWS/States"

    METRICS_PLAN = [
        MetricQuery("started", "ExecutionsStarted", stat="Sum", for_telemetry=True),
        MetricQuery("failed",  "ExecutionsFailed",  stat="Sum", for_telemetry=True)
    ]
    IGNORE_METRICS = []

    def map(self, raw: dict, period_hours: int) -> dict:
        started = raw.get("started", [])
        failed = raw.get("failed", [])
        return {
            "executions": int(self._sum(started)),
            "failedExecutions": int(self._sum(failed))
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "started", "label": "Started Executions", "unit": "Count", "chart": "line"},
            {"key": "failed", "label": "Failed Executions", "unit": "Count", "chart": "line"}
        ]


class StepFunctionsMetricsCollector(BaseMetricsCollector):
    SERVICE = "stepfunctions"

    def __init__(self):
        self.mapper = StepFunctionsMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        arn = node.get("data", {}).get("resource_arn", "")
        return [{"Name": "StateMachineArn", "Value": arn}]
