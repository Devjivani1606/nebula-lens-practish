"""
MetricsMapper — Base class for the Metrics Mapping Layer.

Architecture:
    CloudWatch raw data
         ↓
    MetricsMapper.map(raw_results)
         ↓
    Clean MetricsSummary dict
         ↓
    CostCalculator + Frontend

Each service defines:
  METRICS_PLAN  — list of MetricQuery specs (what to collect + what stat)
  IGNORE_METRICS — CW metrics that exist but are useless for our purposes
  map()          — converts raw → clean MetricsSummary

Why a separate mapper?
  - Collectors only know HOW to fetch (boto3)
  - Mappers only know WHAT the data MEANS
  - Clean separation = easy to add new services, swap logic, unit test independently
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MetricQuery — describes one metric to fetch
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class MetricQuery:
    """
    Declares a single CloudWatch metric to collect.

    Used by BaseMetricsCollector to build the GetMetricData request batch.
    All queries for one resource are sent in ONE API call.
    """
    metric_id:    str                                    # Local alias (must be unique, lowercase, no hyphens)
    metric_name:  str                                    # CW MetricName
    stat:         Literal["Sum", "Average", "Maximum", "Minimum", "SampleCount"] = "Average"
    period:       int = 300                              # Granularity in seconds (5min default)
    for_telemetry: bool = True                           # Include in telemetry time-series?
    for_cost:      bool = False                          # Critical input for CostCalculator?
    unit:          str = ""                              # Expected CW unit (optional, for validation)


# ─────────────────────────────────────────────────────────────────────────────
# BaseMetricsMapper — ABC all service mappers inherit from
# ─────────────────────────────────────────────────────────────────────────────

class BaseMetricsMapper(ABC):
    """
    Defines WHAT to collect and HOW to convert raw CloudWatch results
    into a clean, dashboard-ready MetricsSummary.

    Subclasses must define:
      SERVICE           — e.g. "lambda"
      CW_NAMESPACE      — e.g. "AWS/Lambda"
      METRICS_PLAN      — list of MetricQuery (metrics to collect)
      IGNORE_METRICS    — list of CW metric names that exist but are ignored
      map()             — converts { metric_id: [datapoints] } → MetricsSummary
      telemetry_schema  — declares chart keys/labels/units for frontend
    """

    SERVICE:        str = ""
    CW_NAMESPACE:   str = ""

    # Ordered list of metrics to fetch in one batch call
    METRICS_PLAN: list[MetricQuery] = []

    # CW metrics that exist for this namespace but are deliberately ignored
    # Keep this list as documentation for WHY they were excluded
    IGNORE_METRICS: list[str] = []

    @abstractmethod
    def map(self, raw: dict[str, list], period_hours: int) -> dict:
        """
        Convert raw CloudWatch results into a clean MetricsSummary.

        Args:
            raw:          { metric_id: [sorted datapoints] }
                          datapoints are dicts: { Timestamp, value, Unit }
            period_hours: lookback window (used for extrapolation to monthly)

        Returns MetricsSummary — flat dict of clean key:value pairs.
        All values MUST be:
          - Pure numbers (int or float)
          - Short camelCase keys
          - No string-encoded numbers ("22s", "0.4%")
        """
        ...

    @abstractmethod
    def telemetry_schema(self) -> list[dict]:
        """
        Declare chart layout for frontend.

        Returns list of:
          { "key": "invocations", "label": "Invocations", "unit": "Count", "chart": "bar" }

        chart types: "bar" | "line" | "area"
        """
        ...

    # ─────────────────────────────────────────────────────────────────────────
    # SHARED MAPPING HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _avg(self, dps: list[dict]) -> float:
        """Average of pre-extracted values."""
        if not dps:
            return 0.0
        return round(sum(dp["value"] for dp in dps) / len(dps), 2)

    def _sum(self, dps: list[dict]) -> float:
        """Sum of pre-extracted values."""
        return round(sum(dp["value"] for dp in dps), 2)

    def _max(self, dps: list[dict]) -> float:
        """Max of pre-extracted values."""
        return max((dp["value"] for dp in dps), default=0.0)

    def _last(self, dps: list[dict]) -> float:
        """Most recent value (last in time-sorted list)."""
        return round(dps[-1]["value"], 2) if dps else 0.0

    def _pct(self, numerator: float, denominator: float) -> float:
        """Safe percentage calculation."""
        return round((numerator / denominator * 100) if denominator else 0.0, 2)

    def _to_telemetry(self, raw: dict[str, list], keys: list[str]) -> list[dict]:
        """
        Merge multiple metric series into time-aligned telemetry list.

        Args:
            raw:  { metric_id: [datapoints] }
            keys: list of metric_ids to include

        Returns: [ { "time": "14:30", "invocations": 1200, "duration": 85 }, ... ]
        """
        from collections import defaultdict
        buckets: dict[str, dict] = defaultdict(dict)

        for key in keys:
            for dp in raw.get(key, []):
                t = dp["timestamp"].strftime("%H:%M")
                buckets[t][key] = round(dp["value"], 2)

        return [{"time": t, **vals} for t, vals in sorted(buckets.items())]

    def _extrapolate_monthly(self, value: float, period_hours: int) -> float:
        """Scale a period total to a monthly estimate."""
        if period_hours <= 0:
            return 0.0
        daily  = value * (24 / period_hours)
        monthly = daily * 30
        return round(monthly, 4)
