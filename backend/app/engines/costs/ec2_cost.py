"""
EC2CostCalculator

Billing Model  : Instance-hours (on-demand) + EBS storage + data transfer out
Pricing        : ap-south-1 on-demand (approximate, common instance types)

Formula:
  Cost = (instance_hours × hourly_rate)
       + (ebs_gb × $0.096/GB-month)
       + (data_out_gb × $0.09/GB for first 10TB)

Reference: https://aws.amazon.com/ec2/pricing/on-demand/
"""

from app.engines.costs.base import BaseCostCalculator

# ── Approximate on-demand prices in ap-south-1 (USD/hour) ────────────────────
EC2_ON_DEMAND_PRICES: dict[str, float] = {
    "t2.micro":    0.0116,
    "t2.small":    0.023,
    "t2.medium":   0.0464,
    "t2.large":    0.0928,
    "t3.micro":    0.0104,
    "t3.small":    0.0208,
    "t3.medium":   0.0416,
    "t3.large":    0.0832,
    "t3.xlarge":   0.1664,
    "t3.2xlarge":  0.3328,
    "m5.large":    0.096,
    "m5.xlarge":   0.192,
    "m5.2xlarge":  0.384,
    "m5.4xlarge":  0.768,
    "c5.large":    0.085,
    "c5.xlarge":   0.170,
    "c5.2xlarge":  0.340,
    "r5.large":    0.126,
    "r5.xlarge":   0.252,
    "r5.2xlarge":  0.504,
    "default":     0.096,   # fallback: m5.large equivalent
}

PRICE_EBS_GP2_PER_GB_MONTH    = 0.096   # gp2 SSD
PRICE_DATA_TRANSFER_PER_GB    = 0.09    # first 10TB out to internet


class EC2CostCalculator(BaseCostCalculator):

    SERVICE = "ec2"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        node_metrics   = node.get("data", {}).get("metrics", {})
        instance_type  = metrics_summary.get("instanceType") or node_metrics.get("instanceType", "default")
        instance_state = metrics_summary.get("instanceState") or node_metrics.get("state", "stopped")
        hours_billed   = metrics_summary.get("hoursBilledPeriod", 0)

        # Extrapolate to monthly
        monthly_hours  = (hours_billed / max(hours_billed, 1)) * 730 if instance_state == "running" else 0

        hourly_rate    = EC2_ON_DEMAND_PRICES.get(instance_type, EC2_ON_DEMAND_PRICES["default"])

        # Data transfer out (convert MB → GB → monthly estimate)
        net_out_mb     = metrics_summary.get("totalNetworkOutMB", 0)
        monthly_out_gb = (net_out_mb / 1024) * 30

        # EBS: assume 20GB gp2 if not known (scanner doesn't fetch EBS separately yet)
        ebs_gb = 20  # TODO: pull from ec2_scanner once EBS volume data is added

        line_items = [
            self._line(
                f"EC2 On-Demand ({instance_type})",
                monthly_hours,
                "instance-hours",
                hourly_rate
            ),
            self._line(
                "EBS Storage (gp2)",
                ebs_gb,
                "GB-month",
                PRICE_EBS_GP2_PER_GB_MONTH
            ),
            self._line(
                "Data Transfer Out",
                monthly_out_gb,
                "GB",
                PRICE_DATA_TRANSFER_PER_GB
            ),
        ]

        return self._build_result(
            billing_model="on-demand-hourly",
            dimensions={
                "instanceType":   instance_type,
                "instanceState":  instance_state,
                "monthlyHours":   monthly_hours,
                "ebsGB":          ebs_gb,
                "monthlyOutGB":   monthly_out_gb,
            },
            line_items=line_items,
            region=region,
            notes=f"On-demand {instance_type} in {region}. EBS assumed 20GB gp2."
        )
