"""
LambdaCostCalculator

Billing Model  : Pay-per-use (Requests + GB-seconds)
Pricing        : ap-south-1 on-demand (approximate)

Formula:
  Cost = (requests / 1_000_000 × $0.20)
       + (gb_seconds / 1000 × $0.0000166667)
  Free tier: 1M requests/month + 400,000 GB-seconds/month (not applied here)

Reference: https://aws.amazon.com/lambda/pricing/
"""

from app.engines.costs.base import BaseCostCalculator

# ── ap-south-1 Lambda pricing (USD) ──────────────────────────────────────────
PRICE_PER_1M_REQUESTS  = 0.20           # per 1M invocations
PRICE_PER_GB_SECOND    = 0.0000166667   # per GB-second
FREE_TIER_REQUESTS     = 1_000_000      # per month
FREE_TIER_GB_SECONDS   = 400_000        # per month


class LambdaCostCalculator(BaseCostCalculator):

    SERVICE = "lambda"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        # ── Get values from MetricsEngine summary ─────────────────────────────
        # Extrapolate from period to monthly (assume 24h data → ×30 for month)
        period_invocations = metrics_summary.get("totalInvocations", 0)
        period_gb_seconds  = metrics_summary.get("gbSeconds", 0)

        # Multiply to monthly estimate (data is typically last 24h)
        monthly_requests   = period_invocations * 30
        monthly_gb_seconds = period_gb_seconds  * 30

        # Apply after free tier
        billable_requests   = max(0, monthly_requests   - FREE_TIER_REQUESTS)
        billable_gb_seconds = max(0, monthly_gb_seconds - FREE_TIER_GB_SECONDS)

        line_items = [
            self._line(
                "Lambda Requests",
                billable_requests / 1_000_000,
                "per 1M requests",
                PRICE_PER_1M_REQUESTS
            ),
            self._line(
                "Lambda Compute (GB-seconds)",
                billable_gb_seconds / 1000,
                "per 1K GB-seconds",
                PRICE_PER_GB_SECOND * 1000  # normalize to per-1K
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
            notes=f"Estimated monthly cost for {node.get('data',{}).get('name','Lambda')} in {region}"
        )
