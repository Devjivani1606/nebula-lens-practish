"""
VPCCostCalculator

Billing Model  : NAT Gateway hours + data processed
Pricing        : ap-south-1

Formula:
  Cost = (nat_gateway_count × 730 × $0.048/hour)     ← NAT Gateway hourly
       + (total_data_processed_gb × $0.048/GB)        ← Data processed

Note:
  VPC itself is free. Cost comes from:
  - NAT Gateways     (hourly + per-GB processed)
  - VPC Endpoints    (hourly + per-GB; not tracked here yet)
  - Traffic Mirroring (per-GB; not tracked here yet)

Reference: https://aws.amazon.com/vpc/pricing/
"""

from app.engines.costs.base import BaseCostCalculator

PRICE_NAT_HOURLY         = 0.048   # per NAT Gateway per hour (ap-south-1)
PRICE_NAT_DATA_PER_GB    = 0.048   # per GB processed through NAT Gateway
HOURS_PER_MONTH          = 730


class VPCCostCalculator(BaseCostCalculator):

    SERVICE = "vpc"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        nat_count        = metrics_summary.get("natGatewayCount", 0)
        data_processed   = metrics_summary.get("totalDataProcessedGB", 0)

        # Monthly extrapolation (NAT hours are already per-period; scale to 30d)
        monthly_nat_hours = nat_count * HOURS_PER_MONTH
        monthly_data_gb   = data_processed * 30  # 24h → monthly

        if nat_count == 0 and data_processed == 0:
            return self._zero_result(
                "No NAT Gateways found in this VPC — no billable VPC cost"
            )

        line_items = [
            self._line(
                f"NAT Gateway Hours ({nat_count} gateway(s))",
                monthly_nat_hours,
                "gateway-hours",
                PRICE_NAT_HOURLY
            ),
            self._line(
                "NAT Gateway Data Processed",
                monthly_data_gb,
                "GB",
                PRICE_NAT_DATA_PER_GB
            ),
        ]

        return self._build_result(
            billing_model="nat-gateway-hours-plus-data",
            dimensions={
                "natGatewayCount":     nat_count,
                "monthlyNatHours":     monthly_nat_hours,
                "monthlyDataGB":       monthly_data_gb,
            },
            line_items=line_items,
            region=region,
            notes=f"{nat_count} NAT Gateway(s) in VPC — {region} pricing"
        )
