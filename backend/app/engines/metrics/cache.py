"""
MetricsCache — TTL-based in-memory cache for CloudWatch results.

WHY:
  CloudWatch GetMetricData is expensive (API throttling + cost per metric).
  If normalize is called 5 times in 1 minute, we should not re-query CW.

Strategy:
  - Cache key  = (resource_arn, region, period_hours)
  - TTL        = 5 minutes (configurable)
  - Storage    = in-process dict (no Redis dependency)
  - On expiry  = silent re-fetch

Production upgrade path:
  - Replace _store with Redis client for multi-worker deployments
  - Use CACHE_TTL_SECONDS env var for per-environment tuning

Data retention:
  - CW datapoints are NOT persisted to DB (they are live-fetched)
  - Only MetricsSummary is stored in normalized_nodes.metrics JSONB column
  - Raw telemetryData is kept in memory during the request lifetime only
"""

import time
import threading
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Default: cache CW results for 5 minutes
DEFAULT_TTL_SECONDS = 300


class MetricsCache:
    """
    Thread-safe TTL cache for CloudWatch metric results.

    Usage:
        cache = MetricsCache(ttl_seconds=300)
        hit = cache.get(arn, region, period_hours)
        if hit is None:
            result = fetch_from_cloudwatch(...)
            cache.set(arn, region, period_hours, result)
    """

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS):
        self._store:   dict[str, dict] = {}
        self._lock:    threading.Lock  = threading.Lock()
        self._ttl:     int             = ttl_seconds

    # ─────────────────────────────────────────────────────────────────────────

    def _make_key(self, arn: str, region: str, period_hours: int) -> str:
        return f"{arn}::{region}::{period_hours}"

    def get(self, arn: str, region: str, period_hours: int) -> Optional[dict]:
        """Return cached result or None if missing / expired."""
        key = self._make_key(arn, region, period_hours)
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            if time.monotonic() > entry["expires_at"]:
                del self._store[key]
                logger.debug(f"[MetricsCache] Expired: {arn}")
                return None
            logger.debug(f"[MetricsCache] HIT: {arn}")
            return entry["data"]

    def set(self, arn: str, region: str, period_hours: int, data: dict) -> None:
        """Store result with TTL."""
        key = self._make_key(arn, region, period_hours)
        with self._lock:
            self._store[key] = {
                "data":       data,
                "expires_at": time.monotonic() + self._ttl,
            }
        logger.debug(f"[MetricsCache] SET: {arn} (TTL={self._ttl}s)")

    def invalidate(self, arn: str) -> None:
        """Force-invalidate all entries for a given ARN."""
        with self._lock:
            keys_to_delete = [k for k in self._store if k.startswith(arn)]
            for k in keys_to_delete:
                del self._store[k]

    def clear(self) -> None:
        """Wipe the entire cache (useful for testing)."""
        with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        """Return cache health stats."""
        with self._lock:
            now = time.monotonic()
            live  = sum(1 for e in self._store.values() if e["expires_at"] > now)
            stale = len(self._store) - live
        return {"total": len(self._store), "live": live, "stale": stale, "ttl_seconds": self._ttl}


# ── Singleton shared across the entire app ────────────────────────────────────
metrics_cache = MetricsCache(ttl_seconds=DEFAULT_TTL_SECONDS)
