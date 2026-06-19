"""
S3CostCalculator

Billing Model  : Storage GB-month + Request pricing + Data Transfer Out
Pricing        : ap-south-1

Formula:
  Cost = (avg_storage_gb × $0.025/GB-month)          ← Standard storage
       + (put_requests   / 1000 × $0.005)             ← PUT/COPY/POST/LIST
       + (get_requests   / 1000 × $0.0004)            ← GET/SELECT
       + (data_out_gb    × $0.09/GB)                  ← Transfer out

Reference: https://aws.amazon.com/s3/pricing/
"""

from app.engines.costs.base import BaseCostCalculator

PRICE_STORAGE_PER_GB        = 0.025    # Standard storage per GB-month
PRICE_PUT_PER_1000          = 0.005    # PUT/COPY/POST/LIST per 1K requests
PRICE_GET_PER_1000          = 0.0004   # GET/SELECT per 1K requests
PRICE_DATA_TRANSFER_PER_GB  = 0.09    # First 10TB out to internet


class S3CostCalculator(BaseCostCalculator):

    SERVICE = "s3"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        avg_storage_gb    = metrics_summary.get("avgStorageGB", 0)
        total_put         = metrics_summary.get("totalPutRequests", 0)
        total_get         = metrics_summary.get("totalGetRequests", 0)
        data_out_gb       = metrics_summary.get("dataTransferOutGB", 0)

        # Requests are already from a 24h window — extrapolate to monthly
        monthly_put        = total_put * 30
        monthly_get        = total_get * 30
        monthly_out_gb     = data_out_gb * 30

        line_items = [
            self._line(
                "S3 Standard Storage",
                avg_storage_gb,
                "GB-month",
                PRICE_STORAGE_PER_GB
            ),
            self._line(
                "S3 PUT / COPY / POST / LIST Requests",
                monthly_put / 1000,
                "per 1K requests",
                PRICE_PUT_PER_1000
            ),
            self._line(
                "S3 GET / SELECT Requests",
                monthly_get / 1000,
                "per 1K requests",
                PRICE_GET_PER_1000
            ),
            self._line(
                "Data Transfer Out",
                monthly_out_gb,
                "GB",
                PRICE_DATA_TRANSFER_PER_GB
            ),
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
