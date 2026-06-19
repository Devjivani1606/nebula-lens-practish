"""
SQS Metrics — Mapper + Collector

CloudWatch Namespace : AWS/SQS

COLLECT:
  messages_sent       Sum     → throughput
  messages_received   Sum     → consumer throughput
  messages_deleted    Sum     → successfully processed
  visible_messages    Average → current queue depth (backlog)
  oldest_message_age  Maximum → how old is the oldest unprocessed message (s)

IGNORE:
  - NumberOfEmptyReceives     → polling noise, not useful for dashboard
  - ApproximateNumberOfMessagesNotVisible  → in-flight messages, rarely actionable
  - SentMessageSize           → internal sizing, not cost-critical (SQS bills by request count)
  - NumberOfMessagesMoved     → DLQ redrive only
  - NumberOfMessagesMoveFailed → DLQ redrive only

MetricsSummary schema:
  {
    "messagesSent":      12000,
    "messagesReceived":  11800,
    "messagesDeleted":   11750,
    "visibleMessages":   15,       # current queue depth
    "oldestMessageAge":  22,       # seconds
    "avgMessageSizeKB":  3.2,
    "totalApiRequests":  12000,    # → SQSCostCalculator
  }

CostCalculator inputs: totalApiRequests (64KB-chunked)
IAM: cloudwatch:GetMetricData
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER
# ─────────────────────────────────────────────────────────────────────────────

class SQSMetricsMapper(BaseMetricsMapper):
    SERVICE      = "sqs"
    CW_NAMESPACE = "AWS/SQS"

    METRICS_PLAN = [
        MetricQuery("messages_sent",      "NumberOfMessagesSent",                 stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("messages_received",  "NumberOfMessagesReceived",              stat="Sum",     for_telemetry=True),
        MetricQuery("messages_deleted",   "NumberOfMessagesDeleted",               stat="Sum",     for_telemetry=False),
        MetricQuery("visible_messages",   "ApproximateNumberOfMessagesVisible",    stat="Average", for_telemetry=True),
        MetricQuery("oldest_msg_age",     "ApproximateAgeOfOldestMessage",         stat="Maximum", for_telemetry=False),
    ]

    IGNORE_METRICS = [
        "NumberOfEmptyReceives",                       # polling noise
        "ApproximateNumberOfMessagesNotVisible",        # in-flight, rarely useful for dashboard
        "SentMessageSize",                              # not cost-critical (billed by request count)
        "NumberOfMessagesMoved",                        # DLQ redrive only
        "NumberOfMessagesMoveFailed",                   # DLQ redrive only
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        sent_dps    = raw.get("messages_sent",     [])
        recv_dps    = raw.get("messages_received", [])
        del_dps     = raw.get("messages_deleted",  [])
        vis_dps     = raw.get("visible_messages",  [])
        age_dps     = raw.get("oldest_msg_age",    [])

        messages_sent      = self._sum(sent_dps)
        messages_received  = self._sum(recv_dps)
        messages_deleted   = self._sum(del_dps)
        visible_messages   = int(self._avg(vis_dps))
        oldest_message_age = int(self._max(age_dps))

        # SQS billing: 64KB = 1 API request; every msg rounded up
        # avg size unknown without SentMessageSize → assume 1 request/message (≤64KB)
        total_api_requests = int(messages_sent)

        return {
            "messagesSent":     int(messages_sent),
            "messagesReceived": int(messages_received),
            "messagesDeleted":  int(messages_deleted),
            "visibleMessages":  visible_messages,
            "oldestMessageAge": oldest_message_age,    # seconds
            "totalApiRequests": total_api_requests,    # → SQSCostCalculator
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "messages_sent",     "label": "Messages Sent",     "unit": "Count", "chart": "bar"},
            {"key": "messages_received", "label": "Messages Received",  "unit": "Count", "chart": "bar"},
            {"key": "visible_messages",  "label": "Queue Depth",        "unit": "Count", "chart": "line"},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR
# ─────────────────────────────────────────────────────────────────────────────

class SQSMetricsCollector(BaseMetricsCollector):
    SERVICE = "sqs"

    def __init__(self):
        self.mapper = SQSMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        queue_name = name or arn.split(":")[-1]
        if not queue_name:
            raise ValueError("Cannot determine SQS queue name")
        return [{"Name": "QueueName", "Value": queue_name}]
