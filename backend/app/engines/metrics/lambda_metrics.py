"""
Lambda Metrics — Mapper + Collector

CloudWatch Namespace : AWS/Lambda

COLLECT:
  invocations         Sum     → how many times the function ran
  errors              Sum     → failed invocations
  duration            Average → avg execution time (ms)
  duration_p99        p99     → tail latency (ms)
  throttles           Sum     → rate-limited invocations
  concurrent_execs    Maximum → peak concurrency

IGNORE (deliberately excluded):
  - DeadLetterErrors      → only relevant for async invocations with DLQ
  - IteratorAge           → Kinesis/DynamoDB streams only
  - InitDuration          → cold start detail, too granular for dashboard
  - PostRuntimeExtensions → internal Lambda extension overhead

MetricsSummary schema:
  {
    "invocations":    12000,   # total in period
    "errors":         5,       # total in period
    "errorRate":      0.04,    # %
    "avgDurationMs":  145.2,   # average
    "p99DurationMs":  980.0,   # tail latency
    "maxConcurrency": 24,      # peak
    "throttles":      3,       # total
    "memoryMB":       512,     # from node config
    "gbSeconds":      900.0    # for CostCalculator
  }

CostCalculator inputs: invocations, gbSeconds
IAM: cloudwatch:GetMetricData
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER
# ─────────────────────────────────────────────────────────────────────────────

class LambdaMetricsMapper(BaseMetricsMapper):
    SERVICE       = "lambda"
    CW_NAMESPACE  = "AWS/Lambda"

    METRICS_PLAN = [
        MetricQuery("invocations",      "Invocations",           stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("errors",           "Errors",                stat="Sum",     for_telemetry=True),
        MetricQuery("duration",         "Duration",              stat="Average", for_telemetry=True),
        MetricQuery("duration_p99",     "Duration",              stat="p99",     for_telemetry=False),
        MetricQuery("throttles",        "Throttles",             stat="Sum",     for_telemetry=False),
        MetricQuery("concurrent_execs", "ConcurrentExecutions",  stat="Maximum", for_telemetry=False),
    ]

    IGNORE_METRICS = [
        "DeadLetterErrors",        # Only for DLQ-enabled async Lambda — too specific
        "IteratorAge",             # Only for stream triggers (Kinesis/DDB)
        "InitDuration",            # Cold start only, too granular
        "PostRuntimeExtensionsDuration",  # Internal, not actionable
        "UrlRequestCount",         # Lambda URL only
        "UrlResponseLatency",      # Lambda URL only
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        inv_dps    = raw.get("invocations",      [])
        err_dps    = raw.get("errors",           [])
        dur_dps    = raw.get("duration",         [])
        p99_dps    = raw.get("duration_p99",     [])
        thr_dps    = raw.get("throttles",        [])
        con_dps    = raw.get("concurrent_execs", [])

        invocations = self._sum(inv_dps)
        errors      = self._sum(err_dps)
        avg_dur     = self._avg(dur_dps)
        p99_dur     = self._max(p99_dps)
        throttles   = self._sum(thr_dps)
        max_concurr = self._max(con_dps)

        # GB-seconds = (memory_mb / 1024) × (avg_duration_ms / 1000) × invocations
        # NOTE: memory_mb injected from node during collect → stored in _memory_mb attr
        memory_mb = getattr(self, "_memory_mb", 128)
        gb_seconds = round((memory_mb / 1024) * (avg_dur / 1000) * invocations, 2)

        return {
            "invocations":    int(invocations),
            "errors":         int(errors),
            "errorRate":      self._pct(errors, invocations),
            "avgDurationMs":  round(avg_dur, 1),
            "p99DurationMs":  round(p99_dur, 1),
            "maxConcurrency": int(max_concurr),
            "throttles":      int(throttles),
            "memoryMB":       memory_mb,
            "gbSeconds":      gb_seconds,              # → LambdaCostCalculator
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "invocations", "label": "Invocations",   "unit": "Count",        "chart": "bar"},
            {"key": "errors",      "label": "Errors",        "unit": "Count",        "chart": "bar"},
            {"key": "duration",    "label": "Avg Duration",  "unit": "Milliseconds", "chart": "line"},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR
# ─────────────────────────────────────────────────────────────────────────────

class LambdaMetricsCollector(BaseMetricsCollector):
    SERVICE = "lambda"

    def __init__(self):
        self.mapper = LambdaMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        fn_name = name or arn.split(":")[-1]
        if not fn_name:
            raise ValueError("Cannot determine Lambda function name")

        # Pass memory to mapper so it can compute GB-seconds
        memory_str = node.get("data", {}).get("metrics", {}).get("memory", "128 MB")
        self.mapper._memory_mb = int(str(memory_str).replace(" MB", "").strip())

        return [{"Name": "FunctionName", "Value": fn_name}]
