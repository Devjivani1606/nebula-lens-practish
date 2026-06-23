"""
VPCCostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  1. NAT Gateway hours       → per gateway per hour
  2. NAT Gateway data        → per GB processed

VPC itself is FREE. All VPC cost comes from NAT Gateways.
If no NAT Gateways exist, returns zero cost.
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

HOURS_PER_MONTH = 730


class VPCCostCalculator(BaseCostCalculator):

    SERVICE = "vpc"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials    = node.get("_credentials")
        nat_count      = metrics_summary.get("natGatewayCount", 0) or metrics_summary.get("natGateways", 0)
        data_processed = metrics_summary.get("totalDataProcessedGB", 0)

        if nat_count == 0 and data_processed == 0:
            return self._zero_result("No NAT Gateways found in this VPC — no billable VPC cost")

        monthly_nat_hours = nat_count * HOURS_PER_MONTH
        monthly_data_gb   = data_processed * 30   # 24h metric window → monthly

        # ── Dynamic prices ────────────────────────────────────────────────────
        nat_hourly_rate = pricing_service.get("nat_gateway", region, "hourly", credentials) or 0.0
        nat_data_rate   = pricing_service.get("nat_gateway", region, "data",   credentials) or 0.0

        line_items = [
            self._line(
                f"NAT Gateway Hours ({nat_count} gateway(s))",
                monthly_nat_hours,
                "gateway-hours",
                nat_hourly_rate
            ),
            self._line(
                "NAT Gateway Data Processed",
                monthly_data_gb,
                "GB",
                nat_data_rate
            ),
        ]

        return self._build_result(
            billing_model="nat-gateway-hours-plus-data",
            dimensions={
                "natGatewayCount":  nat_count,
                "monthlyNatHours":  monthly_nat_hours,
                "monthlyDataGB":    monthly_data_gb,
            },
            line_items=line_items,
            region=region,
            notes=f"{nat_count} NAT Gateway(s) in VPC — {region} pricing"
        )
