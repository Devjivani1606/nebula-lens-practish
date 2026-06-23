"""
EventBridge Metrics — Mapper + Collector

CloudWatch Namespace : AWS/Events

COLLECT:
  invocations     Sum     → rules triggered (total events processed)
  failed_inv      Sum     → failed rule invocations
  throttled_rules Sum     → throttled rule evaluations

MetricsSummary schema:
  {
    "totalEvents":        12000,
    "totalCustomEvents":  12000,   # → EventBridgeCostCalculator
    "failedInvocations":  5,
    "throttledRules":     0,
    "errorRate":          0.04,    # %
  }

CostCalculator inputs: totalCustomEvents
IAM: cloudwatch:GetMetricData
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class EventBridgeMetricsMapper(BaseMetricsMapper):
    SERVICE      = "eventbridge"
    CW_NAMESPACE = "AWS/Events"

    METRICS_PLAN = [
        MetricQuery("invocations",     "Invocations",     stat="Sum", for_telemetry=True,  for_cost=True),
        MetricQuery("failed_inv",      "FailedInvocations", stat="Sum", for_telemetry=True),
        MetricQuery("throttled_rules", "ThrottledRules",  stat="Sum", for_telemetry=False),
    ]

    IGNORE_METRICS = [
        "MatchedEvents",    # superset of Invocations; redundant
        "DeadLetterInvocations",  # DLQ only
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        inv_dps  = raw.get("invocations",     [])
        fail_dps = raw.get("failed_inv",      [])
        thr_dps  = raw.get("throttled_rules", [])

        total_events  = self._sum(inv_dps)
        failed        = self._sum(fail_dps)
        throttled     = self._sum(thr_dps)

        return {
            "totalEvents":        int(total_events),
            "totalCustomEvents":  int(total_events),   # → EventBridgeCostCalculator
            "failedInvocations":  int(failed),
            "throttledRules":     int(throttled),
            "errorRate":          self._pct(failed, total_events),
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "invocations", "label": "Invocations",        "unit": "Count", "chart": "bar"},
            {"key": "failed_inv",  "label": "Failed Invocations", "unit": "Count", "chart": "bar"},
        ]


class EventBridgeMetricsCollector(BaseMetricsCollector):
    SERVICE = "eventbridge"

    def __init__(self):
        self.mapper = EventBridgeMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        if not name:
            raise ValueError("Cannot determine EventBridge rule/bus name")
        return [{"Name": "RuleName", "Value": name}]
