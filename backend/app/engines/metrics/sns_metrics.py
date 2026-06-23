from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class SNSMetricsMapper(BaseMetricsMapper):
    SERVICE       = "sns"
    CW_NAMESPACE  = "AWS/SNS"

    METRICS_PLAN = [
        MetricQuery("messages_published",      "NumberOfMessagesPublished",     stat="Sum", for_telemetry=True, for_cost=True),
        MetricQuery("notifications_delivered", "NumberOfNotificationsDelivered", stat="Sum", for_telemetry=True),
        MetricQuery("notifications_failed",    "NumberOfNotificationsFailed",    stat="Sum", for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "SMSMonthToDateSpentUSD",
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        pub_dps = raw.get("messages_published", [])
        del_dps = raw.get("notifications_delivered", [])
        fail_dps = raw.get("notifications_failed", [])

        publishes = self._sum(pub_dps)
        delivered = self._sum(del_dps)
        failed = self._sum(fail_dps)

        return {
            "messagesPublished":      int(publishes),
            "notificationsDelivered": int(delivered),
            "notificationsFailed":    int(failed),
            "deliverySuccessRate":    self._pct(delivered, delivered + failed),
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "messages_published",      "label": "Messages Published",      "unit": "Count", "chart": "bar"},
            {"key": "notifications_delivered", "label": "Notifications Delivered", "unit": "Count", "chart": "bar"},
            {"key": "notifications_failed",    "label": "Notifications Failed",    "unit": "Count", "chart": "bar"},
        ]


class SNSMetricsCollector(BaseMetricsCollector):
    SERVICE = "sns"

    def __init__(self):
        self.mapper = SNSMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        topic_name = name or arn.split(":")[-1]
        if not topic_name:
            raise ValueError("Cannot determine SNS topic name")
        return [{"Name": "TopicName", "Value": topic_name}]
