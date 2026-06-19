"""
SQSCostCalculator

Billing Model  : Pay-per-API-request (64KB chunks)
Pricing        : ap-south-1

Formula:
  Standard Queue: $0.40 per 1M API requests (each 64KB = 1 request)
  FIFO Queue:     $0.50 per 1M API requests
  Free tier: 1M requests/month

Reference: https://aws.amazon.com/sqs/pricing/
"""

from app.engines.costs.base import BaseCostCalculator

PRICE_PER_1M_STD   = 0.40   # Standard queue
PRICE_PER_1M_FIFO  = 0.50   # FIFO queue
FREE_TIER_REQUESTS = 1_000_000


class SQSCostCalculator(BaseCostCalculator):

    SERVICE = "sqs"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        queue_type = node.get("data", {}).get("metrics", {}).get("type", "Standard")
        is_fifo    = queue_type == "FIFO"

        total_api_requests = metrics_summary.get("totalApiRequests", 0)
        monthly_requests   = total_api_requests * 30

        billable_requests  = max(0, monthly_requests - FREE_TIER_REQUESTS)
        unit_price         = PRICE_PER_1M_FIFO if is_fifo else PRICE_PER_1M_STD

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
