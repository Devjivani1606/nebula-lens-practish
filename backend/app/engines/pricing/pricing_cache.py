"""
PricingCache — PostgreSQL-backed cache with fresh + stale retrieval.

Cache strategy:
  - Fresh: entries < 24h old
  - Stale: entries >= 24h old (Last Known Good Price)
  - Two-layer: memory (L1) + PostgreSQL (L2)

Retrieval methods:
  get_fresh()       → returns price if < 24h old, else None
  get_last_known()  → returns price regardless of age (oldest valid fallback)

The Last Known Good Price strategy ensures the cost engine never fails
due to temporary AWS Pricing API outages or rate limits.
"""

import time
import threading
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

FRESH_TTL_SECONDS = 86_400  # 24 hours


@dataclass
class CacheEntry:
    """Structured cache entry with metadata."""
    price: float
    fetched_at: datetime
    source: str  # "fresh_cache" | "stale_cache"

    def is_fresh(self, ttl_seconds: int = FRESH_TTL_SECONDS) -> bool:
        age = (datetime.now(timezone.utc) - self.fetched_at).total_seconds()
        return age < ttl_seconds


class PricingCache:
    """
    Two-layer pricing cache with fresh/stale separation.

    Layer 1: In-process dict  (sub-millisecond, no DB I/O)
    Layer 2: PostgreSQL table (survives restarts, shared across workers)

    Methods:
      get_fresh(service, region, resource_type) → CacheEntry | None
      get_last_known(service, region, resource_type) → CacheEntry | None
      set(service, region, resource_type, price) → None
    """

    def __init__(self):
        self._memory: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()
        self._db_ready = False
        self._init_db()

    # ─────────────────────────────────────────────────────────────────────────
    # DB INIT
    # ─────────────────────────────────────────────────────────────────────────

    def _init_db(self):
        """Create pricing_cache table if it doesn't exist."""
        try:
            from app.database import engine
            from sqlalchemy import text
            with engine.connect() as conn:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS pricing_cache (
                        cache_key   TEXT PRIMARY KEY,
                        price       DOUBLE PRECISION NOT NULL,
                        fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """))
                conn.commit()
            self._db_ready = True
            logger.info("[PricingCache] DB table ready")
        except Exception as e:
            logger.warning(f"[PricingCache] DB init failed — memory-only mode: {e}")
            self._db_ready = False

    # ─────────────────────────────────────────────────────────────────────────
    # CACHE KEY
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def make_key(service: str, region: str, resource_type: str) -> str:
        return f"{service}::{region}::{resource_type}"

    # ─────────────────────────────────────────────────────────────────────────
    # FRESH RETRIEVAL (< 24h old)
    # ─────────────────────────────────────────────────────────────────────────

    def get_fresh(self, service: str, region: str, resource_type: str) -> Optional[CacheEntry]:
        """
        Return cached price if fresh (< 24h old), else None.
        Checks both L1 (memory) and L2 (PostgreSQL).
        """
        key = self.make_key(service, region, resource_type)

        # ── L1: memory ───────────────────────────────────────────────────────
        with self._lock:
            entry = self._memory.get(key)
            if entry and entry.is_fresh():
                logger.debug(f"[PricingCache] FRESH L1 HIT: {key} = ${entry.price}")
                return entry

        # ── L2: database ─────────────────────────────────────────────────────
        if self._db_ready:
            try:
                from app.database import engine
                from sqlalchemy import text
                cutoff = datetime.now(timezone.utc) - timedelta(seconds=FRESH_TTL_SECONDS)
                with engine.connect() as conn:
                    row = conn.execute(
                        text("SELECT price, fetched_at FROM pricing_cache WHERE cache_key = :k AND fetched_at > :cutoff"),
                        {"k": key, "cutoff": cutoff}
                    ).fetchone()
                if row:
                    entry = CacheEntry(
                        price=float(row[0]),
                        fetched_at=row[1],
                        source="fresh_cache"
                    )
                    # Warm L1
                    with self._lock:
                        self._memory[key] = entry
                    logger.info(f"[PricingCache] FRESH L2 HIT: {key} = ${entry.price}")
                    return entry
            except Exception as e:
                logger.warning(f"[PricingCache] L2 read failed: {e}")

        logger.debug(f"[PricingCache] FRESH MISS: {key}")
        return None

    # ─────────────────────────────────────────────────────────────────────────
    # STALE RETRIEVAL (any age — Last Known Good Price)
    # ─────────────────────────────────────────────────────────────────────────

    def get_last_known(self, service: str, region: str, resource_type: str) -> Optional[CacheEntry]:
        """
        Return most recent cached price regardless of age.
        This is the Last Known Good Price fallback.
        Returns None only if no price has EVER been cached.
        """
        key = self.make_key(service, region, resource_type)

        # ── L1: memory (even if stale) ───────────────────────────────────────
        with self._lock:
            entry = self._memory.get(key)
            if entry:
                age_days = (datetime.now(timezone.utc) - entry.fetched_at).days
                logger.info(f"[PricingCache] STALE L1 HIT: {key} = ${entry.price} (age: {age_days}d)")
                entry.source = "stale_cache"
                return entry

        # ── L2: database (any age) ───────────────────────────────────────────
        if self._db_ready:
            try:
                from app.database import engine
                from sqlalchemy import text
                with engine.connect() as conn:
                    row = conn.execute(
                        text("SELECT price, fetched_at FROM pricing_cache WHERE cache_key = :k ORDER BY fetched_at DESC LIMIT 1"),
                        {"k": key}
                    ).fetchone()
                if row:
                    entry = CacheEntry(
                        price=float(row[0]),
                        fetched_at=row[1],
                        source="stale_cache"
                    )
                    age_days = (datetime.now(timezone.utc) - entry.fetched_at).days
                    # Warm L1
                    with self._lock:
                        self._memory[key] = entry
                    logger.info(f"[PricingCache] STALE L2 HIT: {key} = ${entry.price} (age: {age_days}d)")
                    return entry
            except Exception as e:
                logger.warning(f"[PricingCache] Stale L2 read failed: {e}")

        logger.warning(f"[PricingCache] NO CACHE EXISTS: {key} — never fetched before")
        return None

    # ─────────────────────────────────────────────────────────────────────────
    # WRITE
    # ─────────────────────────────────────────────────────────────────────────

    def set(self, service: str, region: str, resource_type: str, price: float) -> None:
        """Write price to both L1 (memory) and L2 (PostgreSQL)."""
        key = self.make_key(service, region, resource_type)
        now = datetime.now(timezone.utc)

        entry = CacheEntry(
            price=price,
            fetched_at=now,
            source="fresh_cache"
        )

        # ── L1: memory ───────────────────────────────────────────────────────
        with self._lock:
            self._memory[key] = entry

        # ── L2: database ─────────────────────────────────────────────────────
        if self._db_ready:
            try:
                from app.database import engine
                from sqlalchemy import text
                with engine.connect() as conn:
                    conn.execute(
                        text("""
                            INSERT INTO pricing_cache (cache_key, price, fetched_at)
                            VALUES (:k, :p, :t)
                            ON CONFLICT (cache_key) DO UPDATE
                                SET price = EXCLUDED.price,
                                    fetched_at = EXCLUDED.fetched_at
                        """),
                        {"k": key, "p": price, "t": now}
                    )
                    conn.commit()
                logger.debug(f"[PricingCache] DB WRITE: {key} = ${price}")
            except Exception as e:
                logger.warning(f"[PricingCache] DB write failed (L1 still valid): {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # UTILITY
    # ─────────────────────────────────────────────────────────────────────────

    def invalidate(self, service: str, region: str, resource_type: str) -> None:
        """Force-invalidate cache entry (both L1 and L2)."""
        key = self.make_key(service, region, resource_type)
        with self._lock:
            self._memory.pop(key, None)
        if self._db_ready:
            try:
                from app.database import engine
                from sqlalchemy import text
                with engine.connect() as conn:
                    conn.execute(text("DELETE FROM pricing_cache WHERE cache_key = :k"), {"k": key})
                    conn.commit()
            except Exception as e:
                logger.warning(f"[PricingCache] Invalidate failed: {e}")

    def stats(self) -> dict:
        """Return cache health stats."""
        with self._lock:
            total = len(self._memory)
            fresh = sum(1 for e in self._memory.values() if e.is_fresh())
            stale = total - fresh
        return {
            "memory_entries": total,
            "fresh": fresh,
            "stale": stale,
            "db_ready": self._db_ready
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
pricing_cache = PricingCache()
