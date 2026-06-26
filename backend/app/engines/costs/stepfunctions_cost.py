from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class StepFunctionsCostCalculator(BaseCostCalculator):
    SERVICE = "stepfunctions"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")
        transition_rate = pricing_service.get("stepfunctions", region, "transitions", credentials) or 0.025

        daily_executions = metrics_summary.get("executions", 0)
        monthly_executions = daily_executions * 30
        # Assume average of 5 state transitions per execution
        monthly_transitions = monthly_executions * 5

        line_items = [
            self._line("State Transitions (Standard Workflow)", monthly_transitions / 1000.0, "1k-transitions", transition_rate)
        ]

        return self._build_result(
            billing_model="pay-per-transition",
            dimensions={
                "monthlyExecutions": monthly_executions,
                "estimatedMonthlyTransitions": monthly_transitions
            },
            line_items=line_items,
            region=region,
            notes=f"Step Functions transitions estimated in {region}."
        )
