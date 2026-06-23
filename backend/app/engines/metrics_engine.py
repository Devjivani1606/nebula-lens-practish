"""
MetricsEngine — pluggable registry-based dispatcher.

Routes each node to the correct service-specific MetricsCollector.
No if-else chains. Adding a new service = register one class.

Usage:
    from app.engines.metrics_engine import metrics_engine
    result = metrics_engine.collect(node, credentials, region)
"""

import logging
from typing import Optional
from app.engines.metrics.base  import BaseMetricsCollector
from app.engines.metrics.cache import metrics_cache

# ── Import all built-in collectors ───────────────────────────────────────────
from app.engines.metrics.lambda_metrics     import LambdaMetricsCollector
from app.engines.metrics.sqs_metrics        import SQSMetricsCollector
from app.engines.metrics.ec2_metrics        import EC2MetricsCollector
from app.engines.metrics.s3_metrics         import S3MetricsCollector
from app.engines.metrics.vpc_metrics        import VPCMetricsCollector
from app.engines.metrics.apigateway_metrics   import APIGatewayMetricsCollector
from app.engines.metrics.subnet_metrics       import SubnetMetricsCollector
from app.engines.metrics.eventbridge_metrics  import EventBridgeMetricsCollector

logger = logging.getLogger(__name__)


class MetricsEngine:
    """
    Central dispatcher for all AWS metrics collection.

    The registry maps service name → collector instance.
    MetricsEngine.collect() routes any node to the right collector automatically.

    To add a new service (e.g. RDS):
      1. Create app/engines/metrics/rds_metrics.py  (inherits BaseMetricsCollector)
      2. Call metrics_engine.register(RDSMetricsCollector())  ← one line
      Done. No other code changes needed.
    """

    def __init__(self):
        # ── Internal registry: { "lambda": LambdaMetricsCollector(), ... } ───
        self._registry: dict[str, BaseMetricsCollector] = {}

        # ── Auto-register all built-in collectors ─────────────────────────────
        self._register_builtins()

    def _register_builtins(self):
        """Register all out-of-the-box service collectors."""
        builtins = [
            LambdaMetricsCollector(),
            SQSMetricsCollector(),
            EC2MetricsCollector(),
            S3MetricsCollector(),
            VPCMetricsCollector(),
            APIGatewayMetricsCollector(),
            SubnetMetricsCollector(),
            EventBridgeMetricsCollector(),
        ]
        for collector in builtins:
            self.register(collector)

    # ─────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────────────

    def register(self, collector: BaseMetricsCollector):
        """
        Register a new service collector.
        Collector must have a SERVICE class attribute (e.g. SERVICE = "rds").
        """
        if not collector.SERVICE:
            raise ValueError(f"Collector {type(collector).__name__} must define SERVICE attribute")
        self._registry[collector.SERVICE] = collector
        logger.info(f"[MetricsEngine] Registered collector for service: {collector.SERVICE}")

    def collect(
        self,
        node: dict,
        credentials: dict,
        region: str,
        period_hours: int = 24
    ) -> dict:
        """
        Route a normalized node to its service-specific collector.

        Args:
            node:         Normalized node dict
            credentials:  AWS temp credentials dict
            region:       AWS region string
            period_hours: CW lookback window (default 24h)

        Returns:
            {
                "service":       "lambda",
                "cloudwatch":    { metricName: [datapoints] },
                "telemetryData": [ { "time": "HH:MM", ... } ],
                "summary":       { "avgInvocations": ..., ... },
                "errors":        [],
                "schema":        [ telemetry schema dicts ]
            }
        """
        service = node.get("data", {}).get("service", "").lower()

        if not service:
            logger.warning(f"[MetricsEngine] Node has no service field: {node.get('id')}")
            return self._unsupported_result(service, node)

        collector = self._registry.get(service)

        if not collector:
            logger.info(f"[MetricsEngine] No collector registered for service '{service}' — skipping")
            return self._unsupported_result(service, node)

        try:
            result = collector.collect(node, credentials, region, period_hours)
            result["service"] = service
            result["schema"]  = collector.get_telemetry_schema()
            return result

        except Exception as e:
            logger.error(f"[MetricsEngine] Collector for '{service}' raised error: {e}")
            return {
                "service":       service,
                "cloudwatch":    {},
                "telemetryData": [],
                "summary":       {},
                "errors":        [str(e)],
                "schema":        []
            }

    def collect_all(
        self,
        nodes: list[dict],
        credentials: dict,
        region: str,
        period_hours: int = 24
    ) -> dict[str, dict]:
        """
        Batch-collect metrics for a list of nodes.
        Returns { arn → metrics result }.

        Batch processing strategy:
          - Subnet: no CW call (static metadata, instant)
          - VPC: EC2 API + 1 CW batch call per VPC
          - All others: 1 CW GetMetricData call per resource (all metrics batched)
          - Cache: skip CW if result is < 5 min old (per-resource TTL)
        """
        results = {}
        cache_hits = 0
        for node in nodes:
            arn = node.get("id") or node.get("data", {}).get("resource_arn", "")
            if not arn:
                continue

            # Quick cache peek to count hits for logging
            if metrics_cache.get(arn, region, period_hours) is not None:
                cache_hits += 1

            results[arn] = self.collect(node, credentials, region, period_hours)

        logger.info(
            f"[MetricsEngine] collect_all: {len(results)} nodes, "
            f"{cache_hits} cache hits, "
            f"{len(results) - cache_hits} CW calls"
        )
        return results

    def supported_services(self) -> list[str]:
        """Return list of all registered service names."""
        return list(self._registry.keys())

    def service_info(self, service: str) -> dict:
        """
        Return mapper metadata for a service:
        - which metrics are collected (METRICS_PLAN)
        - which are deliberately ignored (IGNORE_METRICS)
        - telemetry schema
        """
        collector = self._registry.get(service)
        if not collector or not collector.mapper:
            return {"error": f"No collector for '{service}'"}

        m = collector.mapper
        return {
            "service":       service,
            "namespace":     m.CW_NAMESPACE,
            "collected":     [{"id": q.metric_id, "name": q.metric_name, "stat": q.stat,
                               "forTelemetry": q.for_telemetry, "forCost": q.for_cost}
                              for q in m.METRICS_PLAN],
            "ignored":       m.IGNORE_METRICS,
            "telemetrySchema": m.telemetry_schema(),
        }

    def all_service_info(self) -> dict:
        """Return service_info for every registered service."""
        return {svc: self.service_info(svc) for svc in self._registry}

    def cache_stats(self) -> dict:
        """Return current cache health stats."""
        return metrics_cache.stats()

    # ─────────────────────────────────────────────────────────────────────────
    # PRIVATE HELPERS
    # ─────────────────────────────────────────────────────────────────────────

    def _unsupported_result(self, service: str, node: dict) -> dict:
        return {
            "service":       service,
            "cloudwatch":    {},
            "telemetryData": [],
            "summary":       {},
            "errors":        [f"No metrics collector registered for service '{service}'"],
            "schema":        []
        }


# ── Singleton instance used throughout the app ────────────────────────────────
metrics_engine = MetricsEngine()
