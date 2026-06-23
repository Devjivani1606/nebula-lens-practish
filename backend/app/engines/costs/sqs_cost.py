"""
SQSCostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  - Standard queue: per 1M API requests
  - FIFO queue:     per 1M API requests (higher rate)

Free tier: 1M requests/month
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

FREE_TIER_REQUESTS = 1_000_000


class SQSCostCalculator(BaseCostCalculator):

    SERVICE = "sqs"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        queue_type         = node.get("data", {}).get("metrics", {}).get("type", "Standard")
        is_fifo            = queue_type == "FIFO"
        resource_type_key  = "fifo" if is_fifo else "standard"

        total_api_requests = metrics_summary.get("totalApiRequests", 0)
        monthly_requests   = total_api_requests * 30
        billable_requests  = max(0, monthly_requests - FREE_TIER_REQUESTS)

        # ── Dynamic price ─────────────────────────────────────────────────────
        unit_price = pricing_service.get("sqs", region, resource_type_key, credentials) or 0.0

        line_items = [
            self._line(
                f"SQS API Requests ({'FIFO' if is_fifo else 'Standard'})",
                billable_requests / 1_000_000,
                "per 1M requests",
                unit_price
            )
        ]

        return self._build_result(
            billing_model="pay-per-request",
            dimensions={
                "queueType":        queue_type,
                "monthlyRequests":  monthly_requests,
                "billableRequests": billable_requests,
            },
            line_items=line_items,
            region=region
        )
