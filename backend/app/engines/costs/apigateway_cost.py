"""
APIGatewayCostCalculator

Billing Model  : Pay-per-API-call + data transfer out + caching (optional)
Pricing        : ap-south-1 (REST API)

REST API Formula:
  Cost = (api_calls / 1_000_000 × $3.70)     ← first 333M/month
       + (data_out_gb × $0.09)

HTTP API Formula (cheaper):
  Cost = (api_calls / 1_000_000 × $1.00)     ← first 300M/month
       + (data_out_gb × $0.09)

WebSocket (not tracked yet):
  Cost = (connection_minutes × $0.00) + (messages × $1.00/M)

Reference: https://aws.amazon.com/api-gateway/pricing/
"""

from app.engines.costs.base import BaseCostCalculator

# REST API pricing
PRICE_REST_PER_1M_CALLS     = 3.70   # ap-south-1, first 333M
# HTTP API pricing
PRICE_HTTP_PER_1M_CALLS     = 1.00   # significantly cheaper
# Data transfer
PRICE_DATA_TRANSFER_PER_GB  = 0.09


class APIGatewayCostCalculator(BaseCostCalculator):

    SERVICE = "apigateway"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        api_type       = metrics_summary.get("apiType", "REST")
        total_requests = metrics_summary.get("totalRequests", 0)

        monthly_requests = total_requests * 30
        # Assume ~100KB avg response → data out estimate
        monthly_out_gb   = (monthly_requests * 100_000) / 1_073_741_824

        if api_type == "HTTP":
            price_per_1m = PRICE_HTTP_PER_1M_CALLS
            label = "HTTP API Calls"
        else:
            price_per_1m = PRICE_REST_PER_1M_CALLS
            label = "REST API Calls"

        line_items = [
            self._line(
                label,
                monthly_requests / 1_000_000,
                "per 1M calls",
                price_per_1m
            ),
            self._line(
                "Data Transfer Out",
                monthly_out_gb,
                "GB",
                PRICE_DATA_TRANSFER_PER_GB
            ),
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
            notes=f"{api_type} API in {region} — 100KB avg response assumed for data transfer"
        )
