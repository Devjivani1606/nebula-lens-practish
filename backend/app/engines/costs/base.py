"""
BaseCostCalculator — Abstract base class for all service cost calculators.

Every service-specific calculator must inherit from this and implement:
  - calculate()  → compute estimated monthly cost from metrics summary

Contract:
  calculate() always returns a dict:
    {
        "service":          "lambda",
        "currency":         "USD",
        "billingModel":     "pay-per-use",
        "dimensions":       { "requests": 1_000_000, "gbSeconds": 400_000 },
        "lineItems":        [ { "description": "...", "quantity": ..., "unitPrice": ..., "cost": ... } ],
        "totalMonthlyCost": 2.45,
        "notes":            "Based on ap-south-1 pricing"
    }

PRICING NOTE:
  All prices below are approximate AWS ap-south-1 / us-east-1 on-demand prices.
  In production, replace with AWS Pricing API calls:
    client = boto3.client("pricing", region_name="us-east-1")
    client.get_products(ServiceCode="AWSLambda", ...)
"""

from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


class BaseCostCalculator(ABC):

    SERVICE: str = ""  # Must be overridden

    @abstractmethod
    def calculate(
        self,
        node: dict,
        metrics_summary: dict,
        region: str = "ap-south-1"
    ) -> dict:
        """
        Compute estimated monthly cost.

        Args:
            node:            Normalized node dict
            metrics_summary: Output of MetricsCollector.collect()["summary"]
            region:          AWS region (affects pricing)

        Returns standard cost dict with lineItems and totalMonthlyCost.
        """
        ...

    # ─────────────────────────────────────────────────────────────────────────
    # SHARED HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _build_result(
        self,
        billing_model: str,
        dimensions: dict,
        line_items: list[dict],
        region: str,
        notes: str = ""
    ) -> dict:
        """Build a standardized cost result dict."""
        total = round(sum(item["cost"] for item in line_items), 4)
        daily = round(total / 30, 4)
        yearly = round(total * 12, 4)
        return {
            "service":          self.SERVICE,
            "source":           "pricing-api",
            "confidence":       "estimated",
            "billingModel":     billing_model,
            "dailyCost":        daily,
            "monthlyCost":      total,
            "yearlyCost":       yearly,
            "currency":         "USD",
            "usageMetrics":     dimensions,
            "lineItems":        line_items,
            "notes":            notes or f"Estimated based on {region} on-demand pricing"
        }

    def _line(self, description: str, quantity: float, unit: str, unit_price: float) -> dict:
        """Create a single cost line item."""
        return {
            "description": description,
            "quantity":    round(quantity, 4),
            "unit":        unit,
            "unitPrice":   unit_price,
            "cost":        round(quantity * unit_price, 6)
        }

    def _zero_result(self, reason: str = "") -> dict:
        """Return a zero-cost result (e.g. subnet, no data)."""
        return {
            "service":          self.SERVICE,
            "source":           "pricing-api",
            "confidence":       "estimated",
            "billingModel":     "none",
            "dailyCost":        0.0,
            "monthlyCost":      0.0,
            "yearlyCost":       0.0,
            "currency":         "USD",
            "usageMetrics":     {},
            "lineItems":        [],
            "notes":            reason or "No billable cost for this service"
        }
