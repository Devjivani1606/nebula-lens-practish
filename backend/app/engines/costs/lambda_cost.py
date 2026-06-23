"""
LambdaCostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  1. Requests    → per 1M invocations
  2. GB-seconds  → (memory_mb / 1024) × (avg_duration_ms / 1000) × invocations

Free tier applied before billing:
  - 1M requests/month
  - 400,000 GB-seconds/month
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

FREE_TIER_REQUESTS   = 1_000_000
FREE_TIER_GB_SECONDS = 400_000


class LambdaCostCalculator(BaseCostCalculator):

    SERVICE = "lambda"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        period_invocations = metrics_summary.get("totalInvocations", 0) or metrics_summary.get("invocations", 0)
        period_gb_seconds  = metrics_summary.get("gbSeconds", 0)

        monthly_requests   = period_invocations * 30
        monthly_gb_seconds = period_gb_seconds  * 30

        billable_requests   = max(0, monthly_requests   - FREE_TIER_REQUESTS)
        billable_gb_seconds = max(0, monthly_gb_seconds - FREE_TIER_GB_SECONDS)

        # ── Dynamic prices ────────────────────────────────────────────────────
        price_per_1m_req  = pricing_service.get("lambda", region, "requests",   credentials) or 0.0
        price_per_gb_sec  = pricing_service.get("lambda", region, "gb_seconds", credentials) or 0.0

        line_items = [
            self._line(
                "Lambda Requests",
                billable_requests / 1_000_000,
                "per 1M requests",
                price_per_1m_req
            ),
            self._line(
                "Lambda Compute (GB-seconds)",
                billable_gb_seconds / 1000,
                "per 1K GB-seconds",
                price_per_gb_sec * 1000   # normalize to per-1K for readable line items
            ),
        ]

        return self._build_result(
            billing_model="pay-per-use",
            dimensions={
                "monthlyRequests":   monthly_requests,
                "monthlyGbSeconds":  monthly_gb_seconds,
                "billableRequests":  billable_requests,
                "billableGbSeconds": billable_gb_seconds,
            },
            line_items=line_items,
            region=region,
            notes=f"Estimated monthly cost for {node.get('data', {}).get('name', 'Lambda')} in {region}"
        )
