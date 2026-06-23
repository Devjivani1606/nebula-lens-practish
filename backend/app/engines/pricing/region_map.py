"""
RegionMap — converts AWS region codes to AWS Pricing API location names.

The Pricing API uses human-readable location strings, not region codes.
This map covers every current AWS commercial region.

Usage:
    from app.engines.pricing.region_map import region_to_location
    location = region_to_location("ap-south-1")   # → "Asia Pacific (Mumbai)"
    location = region_to_location("unknown-99")   # → None  (caller uses fallback)
"""

REGION_TO_LOCATION: dict[str, str] = {
    # ── US ───────────────────────────────────────────────────────────────────
    "us-east-1":      "US East (N. Virginia)",
    "us-east-2":      "US East (Ohio)",
    "us-west-1":      "US West (N. California)",
    "us-west-2":      "US West (Oregon)",
    # ── Canada ───────────────────────────────────────────────────────────────
    "ca-central-1":   "Canada (Central)",
    "ca-west-1":      "Canada West (Calgary)",
    # ── Europe ───────────────────────────────────────────────────────────────
    "eu-west-1":      "Europe (Ireland)",
    "eu-west-2":      "Europe (London)",
    "eu-west-3":      "Europe (Paris)",
    "eu-central-1":   "Europe (Frankfurt)",
    "eu-central-2":   "Europe (Zurich)",
    "eu-north-1":     "Europe (Stockholm)",
    "eu-south-1":     "Europe (Milan)",
    "eu-south-2":     "Europe (Spain)",
    # ── Asia Pacific ─────────────────────────────────────────────────────────
    "ap-south-1":     "Asia Pacific (Mumbai)",
    "ap-south-2":     "Asia Pacific (Hyderabad)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ap-southeast-3": "Asia Pacific (Jakarta)",
    "ap-southeast-4": "Asia Pacific (Melbourne)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "ap-northeast-2": "Asia Pacific (Seoul)",
    "ap-northeast-3": "Asia Pacific (Osaka)",
    "ap-east-1":      "Asia Pacific (Hong Kong)",
    # ── Middle East & Africa ─────────────────────────────────────────────────
    "me-south-1":     "Middle East (Bahrain)",
    "me-central-1":   "Middle East (UAE)",
    "af-south-1":     "Africa (Cape Town)",
    "il-central-1":   "Israel (Tel Aviv)",
    # ── South America ────────────────────────────────────────────────────────
    "sa-east-1":      "South America (Sao Paulo)",
}

LOCATION_TO_REGION: dict[str, str] = {v: k for k, v in REGION_TO_LOCATION.items()}


def region_to_location(region: str) -> str | None:
    """
    Convert AWS region code to Pricing API location name.
    Returns None if the region is unknown — caller falls back to hardcoded prices.
    """
    return REGION_TO_LOCATION.get(region)


def supported_regions() -> list[str]:
    return list(REGION_TO_LOCATION.keys())
