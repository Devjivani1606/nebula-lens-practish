"""
EC2CostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  1. Instance hours  → fetched from Pricing API per instance type + region
  2. EBS storage     → fetched from Pricing API (gp2 per GB-month)
  3. Data transfer   → fetched from Pricing API (first 10TB out)

All unit prices are resolved at runtime through the 3-level fallback chain:
    Cache → Pricing API → Hardcoded fallback
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

HOURS_PER_MONTH = 730
DEFAULT_EBS_GB  = 20   # TODO: replace with actual EBS data from ec2_scanner once implemented


class EC2CostCalculator(BaseCostCalculator):

    SERVICE = "ec2"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials   = node.get("_credentials")   # injected by CostEngine.calculate_all()
        node_metrics  = node.get("data", {}).get("metrics", {})

        instance_type  = metrics_summary.get("instanceType")  or node_metrics.get("instanceType", "default")
        instance_state = metrics_summary.get("instanceState") or metrics_summary.get("state") or node_metrics.get("state", "stopped")
        hours_billed   = metrics_summary.get("hoursBilledPeriod", 0)

        # Running instance → extrapolate to full monthly hours
        monthly_hours = HOURS_PER_MONTH if instance_state == "running" else 0

        # ── Dynamic prices ────────────────────────────────────────────────────
        hourly_rate      = pricing_service.get("ec2",          region, instance_type, credentials) or 0.0
        ebs_rate         = pricing_service.get("ebs",          region, "gp2",         credentials) or 0.0
        transfer_rate    = pricing_service.get("data_transfer", region, "out",         credentials) or 0.0

        # Data transfer: network out MB from CloudWatch → GB monthly
        net_out_mb       = metrics_summary.get("totalNetworkOutMB", 0) or metrics_summary.get("networkOutMB", 0)
        monthly_out_gb   = (net_out_mb / 1024) * 30

        line_items = [
            self._line(f"EC2 On-Demand ({instance_type})", monthly_hours,  "instance-hours", hourly_rate),
            self._line("EBS Storage (gp2)",                DEFAULT_EBS_GB, "GB-month",       ebs_rate),
            self._line("Data Transfer Out",                monthly_out_gb, "GB",             transfer_rate),
        ]

        return self._build_result(
            billing_model="on-demand-hourly",
            dimensions={
                "instanceType":  instance_type,
                "instanceState": instance_state,
                "monthlyHours":  monthly_hours,
                "ebsGB":         DEFAULT_EBS_GB,
                "monthlyOutGB":  monthly_out_gb,
            },
            line_items=line_items,
            region=region,
            notes=f"On-demand {instance_type} in {region}. EBS assumed {DEFAULT_EBS_GB}GB gp2."
        )
