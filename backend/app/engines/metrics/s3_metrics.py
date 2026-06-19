"""
S3 Metrics — Mapper + Collector

CloudWatch Namespace : AWS/S3 (two sub-namespaces)
  - Storage metrics: BucketSizeBytes, NumberOfObjects (daily, StorageType dimension)
  - Request metrics: GetRequests, PutRequests, BytesDownloaded (needs request metrics enabled)

COLLECT:
  storage_bytes  Average → bucket size in bytes (daily resolution)
  object_count   Average → number of objects
  get_requests   Sum     → GET requests (cost dimension)
  put_requests   Sum     → PUT/POST/LIST requests (cost dimension)
  bytes_down     Sum     → bytes downloaded (data transfer out → cost)

IGNORE:
  - HeadRequests          → trivial, not cost-significant
  - DeleteRequests        → very cheap ($0 for Standard), not dashboard-relevant
  - ListRequests          → included in PUT pricing, don't double count
  - SelectRequests        → S3 Select only
  - SelectScannedBytes    → S3 Select only
  - SelectReturnedBytes   → S3 Select only
  - AllRequests           → sum of everything; individual breakdown is more useful
  - 4xxErrors, 5xxErrors  → S3 access errors — useful for security but not architecture view
  - BytesUploaded         → PUT bytes detail; PutRequests already covers billing

MetricsSummary schema:
  {
    "storageSizeGB":     1.24,
    "objectCount":       45201,
    "getRequests":       12500,
    "putRequests":       480,
    "downloadedMB":      2400.0,
    "dataTransferOutGB": 2.34,    # → S3CostCalculator
  }

CostCalculator inputs: storageSizeGB, getRequests, putRequests, dataTransferOutGB
IAM: cloudwatch:GetMetricData
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER
# ─────────────────────────────────────────────────────────────────────────────

class S3MetricsMapper(BaseMetricsMapper):
    SERVICE      = "s3"
    CW_NAMESPACE = "AWS/S3"

    # NOTE: Storage metrics use StorageType dimension (added in collector)
    #       Request metrics use FilterId dimension (needs request metrics enabled)
    METRICS_PLAN = [
        MetricQuery("storage_bytes", "BucketSizeBytes", stat="Average", for_telemetry=False, period=86400),  # daily
        MetricQuery("object_count",  "NumberOfObjects",  stat="Average", for_telemetry=False, period=86400),  # daily
        MetricQuery("get_requests",  "GetRequests",      stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("put_requests",  "PutRequests",      stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("bytes_down",    "BytesDownloaded",  stat="Sum",     for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "HeadRequests",        # trivial, free in Standard tier
        "DeleteRequests",      # $0 in Standard, not dashboard-relevant
        "ListRequests",        # included in PUT pricing
        "SelectRequests",      # S3 Select only (specialized)
        "SelectScannedBytes",  # S3 Select only
        "SelectReturnedBytes", # S3 Select only
        "AllRequests",         # superset — use individual breakdowns instead
        "4xxErrors",           # security metric, not architecture view
        "5xxErrors",           # same
        "BytesUploaded",       # PUT count already covers billing
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        storage_dps  = raw.get("storage_bytes", [])
        obj_dps      = raw.get("object_count",  [])
        get_dps      = raw.get("get_requests",  [])
        put_dps      = raw.get("put_requests",  [])
        down_dps     = raw.get("bytes_down",    [])

        storage_bytes  = self._avg(storage_dps)
        object_count   = int(self._avg(obj_dps))
        get_requests   = int(self._sum(get_dps))
        put_requests   = int(self._sum(put_dps))
        bytes_down     = self._sum(down_dps)

        return {
            "storageSizeGB":     round(storage_bytes / 1_073_741_824, 3),
            "objectCount":       object_count,
            "getRequests":       get_requests,           # → S3CostCalculator
            "putRequests":       put_requests,           # → S3CostCalculator
            "downloadedMB":      round(bytes_down / 1_048_576, 1),
            "dataTransferOutGB": round(bytes_down / 1_073_741_824, 4),  # → S3CostCalculator
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "get_requests", "label": "GET Requests", "unit": "Count", "chart": "bar"},
            {"key": "put_requests", "label": "PUT Requests", "unit": "Count", "chart": "bar"},
            {"key": "bytes_down",   "label": "Downloaded",   "unit": "Bytes", "chart": "area"},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR
# ─────────────────────────────────────────────────────────────────────────────

class S3MetricsCollector(BaseMetricsCollector):
    SERVICE = "s3"

    def __init__(self):
        self.mapper = S3MetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        arn         = node.get("data", {}).get("resource_arn", "")
        bucket_name = node.get("data", {}).get("name") or arn.split(":::")[-1]
        if not bucket_name:
            raise ValueError("Cannot determine S3 bucket name")
        return [
            {"Name": "BucketName",  "Value": bucket_name},
            {"Name": "StorageType", "Value": "StandardStorage"},
        ]

    def collect(self, node, credentials, region, period_hours=24):
        """
        S3 override: Storage metrics use StorageType dimension,
        Request metrics need FilterId dimension.
        We do two separate GetMetricData calls and merge results.
        """
        from app.engines.metrics.cache import metrics_cache
        from datetime import datetime, timedelta, timezone

        arn = node.get("data", {}).get("resource_arn") or node.get("id", "")
        cached = metrics_cache.get(arn, region, period_hours)
        if cached:
            return cached

        try:
            bucket_name = node.get("data", {}).get("name") or arn.split(":::")[-1]
            cw          = self._get_cw_client(credentials, region)
            end_time    = datetime.now(timezone.utc)
            start_time  = end_time - timedelta(hours=period_hours)

            # ── Query 1: Storage metrics (StorageType dimension) ──────────────
            storage_queries = [
                {
                    "Id": "storage_bytes",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/S3", "MetricName": "BucketSizeBytes",
                            "Dimensions": [
                                {"Name": "BucketName",  "Value": bucket_name},
                                {"Name": "StorageType", "Value": "StandardStorage"},
                            ]
                        },
                        "Period": 86400, "Stat": "Average",
                    },
                    "ReturnData": True,
                },
                {
                    "Id": "object_count",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/S3", "MetricName": "NumberOfObjects",
                            "Dimensions": [
                                {"Name": "BucketName",  "Value": bucket_name},
                                {"Name": "StorageType", "Value": "AllStorageTypes"},
                            ]
                        },
                        "Period": 86400, "Stat": "Average",
                    },
                    "ReturnData": True,
                },
            ]

            # ── Query 2: Request metrics (FilterId dimension) ─────────────────
            request_queries = [
                {
                    "Id": metric_id,
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "AWS/S3", "MetricName": metric_name,
                            "Dimensions": [
                                {"Name": "BucketName", "Value": bucket_name},
                                {"Name": "FilterId",   "Value": "EntireBucket"},
                            ]
                        },
                        "Period": 300, "Stat": stat,
                    },
                    "ReturnData": True,
                }
                for metric_id, metric_name, stat in [
                    ("get_requests", "GetRequests",     "Sum"),
                    ("put_requests", "PutRequests",     "Sum"),
                    ("bytes_down",   "BytesDownloaded", "Sum"),
                ]
            ]

            raw: dict = {}
            for query_batch in [storage_queries, request_queries]:
                try:
                    resp = cw.get_metric_data(
                        MetricDataQueries=query_batch,
                        StartTime=start_time,
                        EndTime=end_time,
                    )
                    raw.update(self._parse_results(resp))
                except Exception as e:
                    logger.warning(f"[S3] Partial CW fetch failed: {e}")

            summary   = self.mapper.map(raw, period_hours)
            telemetry = self.mapper._to_telemetry(raw, ["get_requests", "put_requests", "bytes_down"])
            schema    = self.mapper.telemetry_schema()

            result = {
                "cloudwatch":    raw,
                "telemetryData": telemetry,
                "summary":       summary,
                "schema":        schema,
                "errors":        [],
            }
            metrics_cache.set(arn, region, period_hours, result)
            return result

        except Exception as e:
            logger.error(f"[S3] Metrics collection failed: {e}")
            return self._empty_result(str(e))
