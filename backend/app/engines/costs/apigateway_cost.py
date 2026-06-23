"""
APIGatewayCostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  1. API calls    → REST ($3.70/1M) or HTTP ($1.00/1M) per region
  2. Data out     → per GB transfer out

NOTE: HTTP API pricing is significantly cheaper than REST.
      apiType is detected from node metrics (set by apigateway_scanner).
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

# Avg response size assumption for data transfer estimation
AVG_RESPONSE_BYTES = 100_000   # 100KB per response


class APIGatewayCostCalculator(BaseCostCalculator):

    SERVICE = "apigateway"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials    = node.get("_credentials")
        api_type       = metrics_summary.get("apiType") or node.get("data", {}).get("metrics", {}).get("type", "REST")
        total_requests = metrics_summary.get("totalRequests", 0) or metrics_summary.get("requests", 0)

        monthly_requests = total_requests * 30
        # Data transfer estimate: avg response × monthly requests → GB
        monthly_out_gb   = (monthly_requests * AVG_RESPONSE_BYTES) / 1_073_741_824

        # ── Dynamic prices ────────────────────────────────────────────────────
        # REST and HTTP have different Pricing API entries; map to our resource_type key
        api_key       = "http" if api_type == "HTTP" else "rest"
        price_per_1m  = pricing_service.get("apigateway", region, api_key,    credentials) or 0.0
        transfer_rate = pricing_service.get("apigateway", region, "transfer", credentials) or 0.0

        label = f"{api_type} API Calls"

        line_items = [
            self._line(label,             monthly_requests / 1_000_000, "per 1M calls", price_per_1m),
            self._line("Data Transfer Out", monthly_out_gb,             "GB",           transfer_rate),
        ]

        return self._build_result(
            billing_model="pay-per-call",
            dimensions={
                "apiType":         api_type,
                "monthlyRequests": monthly_requests,
                "monthlyOutGB":    monthly_out_gb,
            },
            line_items=line_items,
            region=region,
            notes=f"{api_type} API in {region} — {AVG_RESPONSE_BYTES // 1000}KB avg response assumed"
        )
