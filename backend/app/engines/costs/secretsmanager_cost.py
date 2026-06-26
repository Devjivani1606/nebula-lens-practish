from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class SecretsManagerCostCalculator(BaseCostCalculator):
    SERVICE = "secretsmanager"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")
        secret_rate = pricing_service.get("secretsmanager", region, "secrets", credentials) or 0.40
        request_rate = pricing_service.get("secretsmanager", region, "requests", credentials) or 0.05

        daily_calls = metrics_summary.get("apiCalls", 0)
        monthly_calls = daily_calls * 30

        secret_cost_line = self._line("Secrets Manager Secret Storage", 1.0, "secret-month", secret_rate)
        request_cost_line = self._line("Secrets Manager API Requests", monthly_calls / 10000.0, "10k-requests", request_rate)

        line_items = [secret_cost_line, request_cost_line]

        return self._build_result(
            billing_model="pay-per-use",
            dimensions={
                "activeSecrets": 1,
                "monthlyCalls": monthly_calls
            },
            line_items=line_items,
            region=region,
            notes=f"Active secret with API call usage in {region}."
        )
