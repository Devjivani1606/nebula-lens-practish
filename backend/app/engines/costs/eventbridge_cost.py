"""
EventBridgeCostCalculator — dynamic pricing via PricingService.

Billing dimensions:
  - Custom events published → per 1M events
  - Default event bus and AWS service events are FREE.
  - Only custom events (from your own apps) are billed.

Free tier: 1M custom events per month (at account level, not applied here).

Metric source: eventbridge_metrics.py → totalCustomEvents in summary
"""

from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class EventBridgeCostCalculator(BaseCostCalculator):

    SERVICE = "eventbridge"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials   = node.get("_credentials")

        # totalCustomEvents is set by eventbridge_metrics mapper (24h period)
        period_events = metrics_summary.get("totalCustomEvents", 0) or metrics_summary.get("totalEvents", 0)
        monthly_events = period_events * 30

        if monthly_events == 0:
            return self._zero_result(
                "No custom EventBridge events detected — default bus events are free"
            )

        # ── Dynamic price ─────────────────────────────────────────────────────
        price_per_1m = pricing_service.get("eventbridge", region, "events", credentials) or 0.0

        line_items = [
            self._line(
                "EventBridge Custom Events",
                monthly_events / 1_000_000,
                "per 1M events",
                price_per_1m
            )
        ]

        return self._build_result(
            billing_model="pay-per-event",
            dimensions={
                "monthlyEvents": monthly_events,
            },
            line_items=line_items,
            region=region,
            notes=f"Custom events on {node.get('data', {}).get('name', 'EventBridge bus')} in {region}"
        )
