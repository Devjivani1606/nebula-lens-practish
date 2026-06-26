from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

HOURS_PER_MONTH = 730


class EKSCostCalculator(BaseCostCalculator):
    SERVICE = "eks"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")
        hourly_rate = pricing_service.get("eks", region, "cluster", credentials) or 0.10

        line_items = [
            self._line("EKS Cluster Control Plane", HOURS_PER_MONTH, "cluster-hours", hourly_rate)
        ]

        return self._build_result(
            billing_model="cluster-hourly",
            dimensions={"monthlyHours": HOURS_PER_MONTH},
            line_items=line_items,
            region=region,
            notes=f"EKS Control Plane charge in {region}."
        )
