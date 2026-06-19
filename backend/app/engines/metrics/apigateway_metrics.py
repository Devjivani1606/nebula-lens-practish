"""
API Gateway Metrics — Mapper + Collector

CloudWatch Namespace : AWS/ApiGateway

COLLECT:
  requests        Sum     → total API calls (cost dimension)
  latency         Average → end-to-end response time (ms)
  latency_p99     p99     → tail latency
  errors_4xx      Sum     → client errors
  errors_5xx      Sum     → server/integration errors
  cache_hit       Sum     → cache hits (if caching enabled)
  cache_miss      Sum     → cache misses

IGNORE:
  - IntegrationLatency  → backend call time; useful for debugging but not architecture view
  - CacheCount          → superset of hit+miss; redundant
  - ConnectCount        → WebSocket only
  - MessageCount        → WebSocket only
  - ExecutionErrors     → same as 5XXError for most cases
  - ClientError         → same as 4XXError

MetricsSummary schema:
  {
    "requests":        120000,
    "avgLatencyMs":    42.0,
    "p99LatencyMs":    380.0,
    "errors4xx":       48,
    "errors5xx":       2,
    "errorRate":       0.04,      # %
    "cacheHitRate":    65.2,      # %
    "totalRequests":   120000,    # → APIGatewayCostCalculator
  }

CostCalculator inputs: totalRequests, apiType (REST vs HTTP)
IAM: cloudwatch:GetMetricData
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER
# ─────────────────────────────────────────────────────────────────────────────

class APIGatewayMetricsMapper(BaseMetricsMapper):
    SERVICE      = "apigateway"
    CW_NAMESPACE = "AWS/ApiGateway"

    METRICS_PLAN = [
        MetricQuery("requests",    "Count",       stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("latency",     "Latency",     stat="Average", for_telemetry=True),
        MetricQuery("latency_p99", "Latency",     stat="p99",     for_telemetry=False),
        MetricQuery("errors_4xx",  "4XXError",    stat="Sum",     for_telemetry=True),
        MetricQuery("errors_5xx",  "5XXError",    stat="Sum",     for_telemetry=True),
        MetricQuery("cache_hit",   "CacheHitCount",  stat="Sum",  for_telemetry=False),
        MetricQuery("cache_miss",  "CacheMissCount", stat="Sum",  for_telemetry=False),
    ]

    IGNORE_METRICS = [
        "IntegrationLatency",  # backend call time; too granular for architecture view
        "CacheCount",          # superset of hit+miss; redundant
        "ConnectCount",        # WebSocket API only
        "MessageCount",        # WebSocket API only
        "ExecutionErrors",     # overlaps with 5XXError
        "ClientError",         # overlaps with 4XXError
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        req_dps    = raw.get("requests",    [])
        lat_dps    = raw.get("latency",     [])
        p99_dps    = raw.get("latency_p99", [])
        e4_dps     = raw.get("errors_4xx",  [])
        e5_dps     = raw.get("errors_5xx",  [])
        hit_dps    = raw.get("cache_hit",   [])
        miss_dps   = raw.get("cache_miss",  [])

        total_reqs  = self._sum(req_dps)
        avg_lat     = self._avg(lat_dps)
        p99_lat     = self._max(p99_dps)
        errors_4xx  = self._sum(e4_dps)
        errors_5xx  = self._sum(e5_dps)
        total_err   = errors_4xx + errors_5xx
        cache_hits  = self._sum(hit_dps)
        cache_total = cache_hits + self._sum(miss_dps)

        return {
            "requests":      int(total_reqs),
            "avgLatencyMs":  round(avg_lat, 1),
            "p99LatencyMs":  round(p99_lat, 1),
            "errors4xx":     int(errors_4xx),
            "errors5xx":     int(errors_5xx),
            "errorRate":     self._pct(total_err, total_reqs),
            "cacheHitRate":  self._pct(cache_hits, cache_total),
            "totalRequests": int(total_reqs),   # → APIGatewayCostCalculator
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "requests",   "label": "Requests",   "unit": "Count",        "chart": "bar"},
            {"key": "latency",    "label": "Latency",    "unit": "Milliseconds", "chart": "line"},
            {"key": "errors_4xx", "label": "4XX Errors", "unit": "Count",        "chart": "bar"},
            {"key": "errors_5xx", "label": "5XX Errors", "unit": "Count",        "chart": "bar"},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR
# ─────────────────────────────────────────────────────────────────────────────

class APIGatewayMetricsCollector(BaseMetricsCollector):
    SERVICE = "apigateway"

    def __init__(self):
        self.mapper = APIGatewayMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        data     = node.get("data", {})
        metrics  = data.get("metrics", {})
        api_id   = metrics.get("apiId") or data.get("resource_arn", "").split("/")[-1]
        api_name = data.get("name", api_id)
        api_type = metrics.get("type", "REST")

        if not api_id:
            raise ValueError("Cannot determine API Gateway ID")

        # REST APIs use ApiName dim, HTTP APIs use ApiId
        if api_type == "HTTP":
            return [{"Name": "ApiId", "Value": api_id}]
        else:
            return [{"Name": "ApiName", "Value": api_name}]
