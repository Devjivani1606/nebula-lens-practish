"""
Pricing package — dynamic AWS Pricing API integration for Nebula Lens.

Components:
  region_map.py     — region code → Pricing API location name
  pricing_cache.py  — DB-backed 24h pricing cache
  pricing_service.py — central pricing fetcher with 3-level fallback
"""
from app.engines.pricing.pricing_service import pricing_service

__all__ = ["pricing_service"]
