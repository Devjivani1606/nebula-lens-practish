from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class CloudFrontMetricsMapper(BaseMetricsMapper):
    SERVICE       = "cloudfront"
    CW_NAMESPACE  = "AWS/CloudFront"

    METRICS_PLAN = [
        MetricQuery("requests",          "Requests",          stat="Sum",     for_telemetry=True, for_cost=True),
        MetricQuery("bytes_downloaded",  "BytesDownloaded",  stat="Sum",     for_telemetry=True, for_cost=True),
        MetricQuery("bytes_uploaded",    "BytesUploaded",    stat="Sum",     for_telemetry=True),
        MetricQuery("error_rate",        "TotalErrorRate",    stat="Average", for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "4xxErrorRate",
        "5xxErrorRate",
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        req_dps = raw.get("requests", [])
        dl_dps = raw.get("bytes_downloaded", [])
        ul_dps = raw.get("bytes_uploaded", [])
        err_dps = raw.get("error_rate", [])

        requests = self._sum(req_dps)
        dl_bytes = self._sum(dl_dps)
        ul_bytes = self._sum(ul_dps)
        err_rate = self._avg(err_dps)

        return {
            "requests":         int(requests),
            "bytesDownloaded":  int(dl_bytes),
            "bytesUploaded":    int(ul_bytes),
            "totalErrorRate":   round(err_rate, 2),
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "requests",          "label": "Requests",          "unit": "Count",   "chart": "bar"},
            {"key": "bytes_downloaded",  "label": "Data Downloaded",   "unit": "Bytes",   "chart": "line"},
            {"key": "error_rate",        "label": "Total Error Rate",  "unit": "Percent", "chart": "line"},
        ]


class CloudFrontMetricsCollector(BaseMetricsCollector):
    SERVICE = "cloudfront"

    def __init__(self):
        self.mapper = CloudFrontMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        dist_id = name or arn.split("/")[-1]
        if not dist_id:
            raise ValueError("Cannot determine CloudFront Distribution ID")
        return [
            {"Name": "DistributionId", "Value": dist_id},
            {"Name": "Region",         "Value": "Global"}
        ]
