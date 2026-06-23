from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

FREE_TIER_REQUESTS = 1_000_000


class SNSCostCalculator(BaseCostCalculator):

    SERVICE = "sns"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        topic_type = node.get("data", {}).get("metrics", {}).get("type", "Standard")
        is_fifo = topic_type == "FIFO"
        resource_type_key = "fifo" if is_fifo else "standard"

        total_publishes = metrics_summary.get("messagesPublished", 0) or metrics_summary.get("numberOfMessagesPublished", 0)
        monthly_requests = total_publishes * 30
        billable_requests = max(0, monthly_requests - FREE_TIER_REQUESTS)

        # ── Dynamic price ─────────────────────────────────────────────────────
        fallback_price = 0.30 if is_fifo else 0.50
        price_per_1m = pricing_service.get("sns", region, f"requests:{resource_type_key}", credentials)
        if price_per_1m is None:
            price_per_1m = fallback_price

        line_items = [
            self._line(
                f"SNS Publish Requests ({'FIFO' if is_fifo else 'Standard'})",
                billable_requests / 1_000_000,
                "per 1M requests",
                price_per_1m
            )
        ]

        return self._build_result(
            billing_model="pay-per-request",
            dimensions={
                "topicType": topic_type,
                "monthlyRequests": monthly_requests,
                "billableRequests": billable_requests,
            },
            line_items=line_items,
            region=region,
            notes=f"Estimated monthly cost for SNS {node.get('data', {}).get('name', 'Topic')} in {region}"
        )
