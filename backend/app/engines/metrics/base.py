"""
BaseMetricsCollector — Redesigned with Batch Collection + Mapper Layer.

Key upgrades over v1:
  1. GetMetricData instead of GetMetricStatistics
     → ONE API call fetches ALL metrics for a resource (was N calls)
     → 10x cheaper in API calls for resources with many metrics

  2. Mapper delegation
     → Collector only knows HOW to fetch (boto3 plumbing)
     → Mapper knows WHAT the data MEANS (business logic)
     → Fully unit-testable without AWS credentials

  3. Cache integration
     → MetricsCache TTL 5 min → zero redundant CW calls

  4. Structured datapoints
     → Raw dps standardized to { timestamp, value, unit } before mapper sees them

Flow per resource:
    collect(node, credentials, region)
        ↓
    cache.get(arn)  →  HIT?  return cached
        ↓ MISS
    _build_metric_queries()  → mapper.METRICS_PLAN → MetricDataQueries list
        ↓
    CW.get_metric_data(queries)  → ONE API CALL
        ↓
    _parse_results()  → { metric_id: [{ timestamp, value, unit }] }
        ↓
    mapper.map(raw)  → MetricsSummary
        ↓
    mapper._to_telemetry(raw)  → telemetryData
        ↓
    cache.set(arn, result)
        ↓
    return result
"""

from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
import logging

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.cache  import metrics_cache

logger = logging.getLogger(__name__)


class BaseMetricsCollector(ABC):
    """
    Abstract base for all AWS service metrics collectors.

    Subclasses must define:
      SERVICE   — "lambda" / "ec2" / etc.
      mapper    — instance of the service-specific BaseMetricsMapper

    Subclasses inherit the full collection + caching pipeline from here.
    They do NOT need to override collect() unless they have non-CW data sources.
    """

    SERVICE: str = ""   # Must be set on subclass
    mapper: Optional[BaseMetricsMapper] = None  # Set in __init__ of subclass

    # ─────────────────────────────────────────────────────────────────────────
    # MAIN ENTRYPOINT — called by MetricsEngine
    # ─────────────────────────────────────────────────────────────────────────

    def collect(
        self,
        node: dict,
        credentials: dict,
        region: str,
        period_hours: int = 24
    ) -> dict:
        """
        Full pipeline: cache check → batch CW fetch → mapper → return.

        Always returns:
        {
            "cloudwatch":    {},          # raw (not returned to frontend)
            "telemetryData": [...],       # time-series for charts
            "summary":       {...},       # MetricsSummary from mapper
            "schema":        [...],       # telemetry chart spec
            "errors":        []
        }
        """
        arn = node.get("data", {}).get("resource_arn") or node.get("id", "")

        # ── 1. Cache check ────────────────────────────────────────────────────
        cached = metrics_cache.get(arn, region, period_hours)
        if cached is not None:
            return cached

        # ── 2. Validate mapper ────────────────────────────────────────────────
        if self.mapper is None:
            return self._empty_result("No mapper configured for this collector")

        if not self.mapper.METRICS_PLAN:
            # Service has no CW metrics (e.g. Subnet)
            result = self._static_result(node)
            metrics_cache.set(arn, region, period_hours, result)
            return result

        # ── 3. Determine dimensions for this resource ─────────────────────────
        try:
            dimensions = self._get_dimensions(node)
        except Exception as e:
            return self._empty_result(f"Could not determine CW dimensions: {e}")

        if not dimensions:
            return self._empty_result("Empty dimensions — cannot query CloudWatch")

        # ── 4. Build GetMetricData batch request ──────────────────────────────
        try:
            cw = self._get_cw_client(credentials, region)
            end_time   = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=period_hours)

            queries = self._build_queries(dimensions)
            if not queries:
                return self._empty_result("No metric queries built")

            # ── 5. ONE batch API call for ALL metrics ─────────────────────────
            raw_response = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start_time,
                EndTime=end_time,
            )

        except Exception as e:
            logger.error(f"[{self.SERVICE}] CloudWatch GetMetricData failed: {e}")
            return self._empty_result(str(e))

        # ── 6. Parse response → structured datapoints per metric_id ──────────
        raw = self._parse_results(raw_response)

        # ── 7. Delegate to mapper ─────────────────────────────────────────────
        try:
            summary      = self.mapper.map(raw, period_hours)
            telemetry_keys = [q.metric_id for q in self.mapper.METRICS_PLAN if q.for_telemetry]
            telemetry    = self.mapper._to_telemetry(raw, telemetry_keys)
            schema       = self.mapper.telemetry_schema()
        except Exception as e:
            logger.error(f"[{self.SERVICE}] Mapper failed: {e}")
            return self._empty_result(f"Mapper error: {e}")

        result = {
            "cloudwatch":    raw,           # raw datapoints (not sent to frontend)
            "telemetryData": telemetry,     # time-series chart data
            "summary":       summary,       # clean MetricsSummary
            "schema":        schema,        # chart rendering spec
            "errors":        [],
        }

        # ── 8. Cache the result ───────────────────────────────────────────────
        metrics_cache.set(arn, region, period_hours, result)
        return result

    # ─────────────────────────────────────────────────────────────────────────
    # ABSTRACT — must implement in each service collector
    # ─────────────────────────────────────────────────────────────────────────

    @abstractmethod
    def _get_dimensions(self, node: dict) -> list[dict]:
        """
        Return CloudWatch dimensions list for this specific resource.

        Example Lambda:
          [ {"Name": "FunctionName", "Value": "my-processor"} ]
        Example EC2:
          [ {"Name": "InstanceId", "Value": "i-0abc123"} ]
        """
        ...

    # ─────────────────────────────────────────────────────────────────────────
    # SHARED HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _get_cw_client(self, credentials: dict, region: str):
        """Build boto3 CloudWatch client from temporary credentials."""
        import boto3
        return boto3.client(
            "cloudwatch",
            region_name=region,
            aws_access_key_id=credentials["AccessKeyId"],
            aws_secret_access_key=credentials["SecretAccessKey"],
            aws_session_token=credentials.get("SessionToken"),
        )

    def _build_queries(self, dimensions: list[dict]) -> list[dict]:
        """
        Convert METRICS_PLAN → GetMetricData MetricDataQueries list.

        GetMetricData supports up to 500 queries per request.
        One call fetches ALL metrics for this resource.
        """
        queries = []
        for mq in self.mapper.METRICS_PLAN:
            queries.append({
                "Id":         mq.metric_id,
                "MetricStat": {
                    "Metric": {
                        "Namespace":  self.mapper.CW_NAMESPACE,
                        "MetricName": mq.metric_name,
                        "Dimensions": dimensions,
                    },
                    "Period":    mq.period,
                    "Stat":      mq.stat,
                    **({"Unit": mq.unit} if mq.unit else {}),
                },
                "ReturnData": True,
            })
        return queries

    def _parse_results(self, response: dict) -> dict[str, list]:
        """
        Parse GetMetricData response → { metric_id: [{ timestamp, value, unit }] }

        Sorts datapoints ascending by timestamp.
        Normalizes datapoint structure so mapper never sees raw boto3 dicts.
        """
        results: dict[str, list] = {}
        for mr in response.get("MetricDataResults", []):
            metric_id  = mr["Id"]
            timestamps = mr.get("Timestamps", [])
            values     = mr.get("Values", [])

            paired = sorted(
                zip(timestamps, values),
                key=lambda tv: tv[0]
            )
            results[metric_id] = [
                {"timestamp": ts, "value": val, "unit": mr.get("Label", "")}
                for ts, val in paired
            ]
        return results

    def _empty_result(self, error: str = "") -> dict:
        """Standard empty/error result."""
        return {
            "cloudwatch":    {},
            "telemetryData": [],
            "summary":       {},
            "schema":        self.mapper.telemetry_schema() if self.mapper else [],
            "errors":        [error] if error else [],
        }

    def _static_result(self, node: dict) -> dict:
        """
        For services with no CW namespace (e.g. Subnet).
        Mapper still runs to produce a summary from node metadata.
        """
        summary = self.mapper.map({}, 24) if self.mapper else {}
        return {
            "cloudwatch":    {},
            "telemetryData": [],
            "summary":       summary,
            "schema":        self.mapper.telemetry_schema() if self.mapper else [],
            "errors":        [],
        }

    def get_telemetry_schema(self) -> list[dict]:
        """Delegates to mapper — used by MetricsEngine."""
        return self.mapper.telemetry_schema() if self.mapper else []
