"""
S3CostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  1. Storage      → per GB-month (Standard)
  2. PUT requests → per 1K PUT/COPY/POST/LIST
  3. GET requests → per 1K GET/SELECT
  4. Data out     → per GB transfer out to internet
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class S3CostCalculator(BaseCostCalculator):

    SERVICE = "s3"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        avg_storage_gb = metrics_summary.get("avgStorageGB", 0) or metrics_summary.get("storageSizeGB", 0)
        total_put      = metrics_summary.get("totalPutRequests", 0) or metrics_summary.get("putRequests", 0)
        total_get      = metrics_summary.get("totalGetRequests", 0) or metrics_summary.get("getRequests", 0)
        data_out_gb    = metrics_summary.get("dataTransferOutGB", 0)

        # 24h window → monthly
        monthly_put    = total_put    * 30
        monthly_get    = total_get    * 30
        monthly_out_gb = data_out_gb  * 30

        # ── Dynamic prices ────────────────────────────────────────────────────
        storage_rate  = pricing_service.get("s3", region, "storage",  credentials) or 0.0
        put_rate      = pricing_service.get("s3", region, "put",      credentials) or 0.0
        get_rate      = pricing_service.get("s3", region, "get",      credentials) or 0.0
        transfer_rate = pricing_service.get("s3", region, "transfer", credentials) or 0.0

        line_items = [
            self._line("S3 Standard Storage",              avg_storage_gb,    "GB-month",       storage_rate),
            self._line("S3 PUT / COPY / POST / LIST",      monthly_put / 1000, "per 1K requests", put_rate),
            self._line("S3 GET / SELECT Requests",         monthly_get / 1000, "per 1K requests", get_rate),
            self._line("Data Transfer Out",                monthly_out_gb,    "GB",             transfer_rate),
        ]

        return self._build_result(
            billing_model="storage-plus-requests",
            dimensions={
                "avgStorageGB":   avg_storage_gb,
                "monthlyPutReqs": monthly_put,
                "monthlyGetReqs": monthly_get,
                "monthlyOutGB":   monthly_out_gb,
            },
            line_items=line_items,
            region=region
        )
