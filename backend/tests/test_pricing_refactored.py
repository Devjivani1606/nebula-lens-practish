"""
Test Suite for Refactored PricingService (NO hardcoded fallback).

Tests the complete pricing hierarchy:
    1. Fresh cache (<24h)
    2. AWS Pricing API
    3. Stale cache (any age — Last Known Good)
    4. Unavailable (returns None)

Run:
    pytest backend/tests/test_pricing_refactored.py -v
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch, MagicMock

from app.engines.pricing.pricing_service import pricing_service, PricingResult
from app.engines.pricing.pricing_cache import pricing_cache, CacheEntry


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_credentials():
    return {
        "AccessKeyId": "AKIATEST",
        "SecretAccessKey": "SECRET",
        "SessionToken": "TOKEN"
    }


@pytest.fixture(autouse=True)
def reset_cache():
    """Clear cache before each test."""
    with pricing_cache._lock:
        pricing_cache._memory.clear()
    yield


# ─────────────────────────────────────────────────────────────────────────────
# UNIT TESTS — CACHE LAYER
# ─────────────────────────────────────────────────────────────────────────────

def test_cache_fresh_hit():
    """Test fresh cache retrieval (<24h old)."""
    pricing_cache.set("ec2", "us-east-1", "t3.medium", 0.0416)
    
    entry = pricing_cache.get_fresh("ec2", "us-east-1", "t3.medium")
    
    assert entry is not None
    assert entry.price == 0.0416
    assert entry.source == "fresh_cache"
    assert entry.is_fresh()


def test_cache_fresh_miss_when_stale():
    """Test fresh cache returns None for stale entries (>24h old)."""
    # Inject a stale entry (25 hours old)
    stale_time = datetime.now(timezone.utc) - timedelta(hours=25)
    stale_entry = CacheEntry(price=0.05, fetched_at=stale_time, source="stale_cache")
    
    with pricing_cache._lock:
        pricing_cache._memory["ec2::us-east-1::t3.medium"] = stale_entry
    
    entry = pricing_cache.get_fresh("ec2", "us-east-1", "t3.medium")
    
    assert entry is None  # Fresh miss because entry is >24h old


def test_cache_last_known_returns_stale():
    """Test Last Known Good returns stale entries (any age)."""
    # Inject 30-day-old entry
    old_time = datetime.now(timezone.utc) - timedelta(days=30)
    old_entry = CacheEntry(price=0.045, fetched_at=old_time, source="stale_cache")
    
    with pricing_cache._lock:
        pricing_cache._memory["lambda::ap-south-1::requests"] = old_entry
    
    entry = pricing_cache.get_last_known("lambda", "ap-south-1", "requests")
    
    assert entry is not None
    assert entry.price == 0.045
    assert entry.source == "stale_cache"
    assert not entry.is_fresh()


def test_cache_last_known_returns_none_when_never_cached():
    """Test Last Known Good returns None if no entry ever existed."""
    entry = pricing_cache.get_last_known("dynamodb", "eu-west-1", "read_units")
    
    assert entry is None


def test_cache_key_format():
    """Test cache key generation."""
    key = pricing_cache.make_key("s3", "ap-south-1", "storage")
    assert key == "s3::ap-south-1::storage"


# ─────────────────────────────────────────────────────────────────────────────
# UNIT TESTS — PRICING SERVICE HIERARCHY
# ─────────────────────────────────────────────────────────────────────────────

def test_pricing_hierarchy_level1_fresh_cache(mock_credentials):
    """Test Level 1: Fresh cache hit — no API call."""
    # Pre-populate fresh cache
    pricing_cache.set("ec2", "us-east-1", "t3.medium", 0.0416)
    
    with patch.object(pricing_service, '_fetch_from_api') as mock_api:
        result = pricing_service.get_detailed("ec2", "us-east-1", "t3.medium", mock_credentials)
        
        assert result.price == 0.0416
        assert result.source == "fresh_cache"
        assert result.fetched_at is not None
        mock_api.assert_not_called()  # API should NOT be called


def test_pricing_hierarchy_level2_api_success(mock_credentials):
    """Test Level 2: Fresh cache miss → API success → cache write."""
    with patch.object(pricing_service, '_fetch_from_api', return_value=3.70):
        result = pricing_service.get_detailed("apigateway", "us-east-1", "rest", mock_credentials)
        
        assert result.price == 3.70
        assert result.source == "pricing_api"
        
        # Verify cache was updated
        cached = pricing_cache.get_fresh("apigateway", "us-east-1", "rest")
        assert cached.price == 3.70


def test_pricing_hierarchy_level3_stale_cache_after_api_failure(mock_credentials):
    """Test Level 3: Fresh miss + API failure → stale cache fallback."""
    # Pre-populate old cache (26 hours ago)
    old_time = datetime.now(timezone.utc) - timedelta(hours=26)
    old_entry = CacheEntry(price=0.048, fetched_at=old_time, source="stale_cache")
    with pricing_cache._lock:
        pricing_cache._memory["nat_gateway::us-west-2::hourly"] = old_entry
    
    # Simulate API failure
    with patch.object(pricing_service, '_fetch_from_api', return_value=None):
        result = pricing_service.get_detailed("nat_gateway", "us-west-2", "hourly", mock_credentials)
        
        assert result.price == 0.048  # Got stale price
        assert result.source == "stale_cache"
        assert (datetime.now(timezone.utc) - result.fetched_at).days >= 1


def test_pricing_hierarchy_level4_unavailable(mock_credentials):
    """Test Level 4: Fresh miss + API failure + no stale cache → unavailable."""
    with patch.object(pricing_service, '_fetch_from_api', return_value=None):
        result = pricing_service.get_detailed("dynamodb", "eu-west-1", "read_units", mock_credentials)
        
        assert result.price is None
        assert result.source == "unavailable"
        assert result.fetched_at is None
        assert not result.is_available()


def test_pricing_get_backward_compat(mock_credentials):
    """Test .get() returns float | None for backward compatibility."""
    pricing_cache.set("lambda", "us-east-1", "requests", 0.20)
    
    price = pricing_service.get("lambda", "us-east-1", "requests", mock_credentials)
    
    assert isinstance(price, float)
    assert price == 0.20


def test_pricing_get_returns_none_when_unavailable(mock_credentials):
    """Test .get() returns None when pricing unavailable."""
    with patch.object(pricing_service, '_fetch_from_api', return_value=None):
        price = pricing_service.get("unknown", "region-99", "resource", mock_credentials)
        
        assert price is None


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRATION TESTS — PRICING API
# ─────────────────────────────────────────────────────────────────────────────

def test_pricing_api_call_structure(mock_credentials):
    """Test AWS Pricing API call is constructed correctly."""
    mock_client = Mock()
    mock_client.get_products.return_value = {
        "PriceList": [
            '{"terms":{"OnDemand":{"offer":{"priceDimensions":{"dim":{"pricePerUnit":{"USD":"0.0416"}}}}}}}'
        ]
    }
    
    with patch('boto3.client', return_value=mock_client):
        price = pricing_service._fetch_from_api("ec2", "us-east-1", "t3.medium", mock_credentials)
        
        assert price == 0.0416
        mock_client.get_products.assert_called_once()
        call_args = mock_client.get_products.call_args
        assert call_args[1]["ServiceCode"] == "AmazonEC2"
        assert any(f["Value"] == "US East (N. Virginia)" for f in call_args[1]["Filters"])


def test_pricing_api_failure_returns_none(mock_credentials):
    """Test API failure returns None (no exception raised)."""
    mock_client = Mock()
    mock_client.get_products.side_effect = Exception("Network timeout")
    
    with patch('boto3.client', return_value=mock_client):
        price = pricing_service._fetch_from_api("s3", "us-east-1", "storage", mock_credentials)
        
        assert price is None  # Graceful failure


def test_region_mapping_unknown_region(mock_credentials):
    """Test unknown region code returns None (no crash)."""
    price = pricing_service._fetch_from_api("ec2", "unknown-region-99", "t3.micro", mock_credentials)
    
    assert price is None


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRATION TESTS — COST CALCULATORS
# ─────────────────────────────────────────────────────────────────────────────

def test_ec2_calculator_handles_none_price(mock_credentials):
    """Test EC2 calculator gracefully handles unavailable pricing."""
    from app.engines.costs.ec2_cost import EC2CostCalculator
    
    calculator = EC2CostCalculator()
    node = {
        "_credentials": mock_credentials,
        "data": {"metrics": {"instanceType": "t3.medium", "state": "running"}}
    }
    metrics_summary = {"instanceState": "running", "networkOutMB": 1000}
    
    with patch.object(pricing_service, 'get', return_value=None):
        result = calculator.calculate(node, metrics_summary, "us-east-1")
        
        # Should return $0 cost but not crash
        assert result["monthlyCost"] == 0.0
        assert result["billingModel"] == "on-demand-hourly"


def test_lambda_calculator_with_stale_price(mock_credentials):
    """Test Lambda calculator uses stale cache when API unavailable."""
    from app.engines.costs.lambda_cost import LambdaCostCalculator
    
    # Pre-populate 10-day-old price
    old_time = datetime.now(timezone.utc) - timedelta(days=10)
    pricing_cache._memory["lambda::us-east-1::requests"] = CacheEntry(
        price=0.20, fetched_at=old_time, source="stale_cache"
    )
    pricing_cache._memory["lambda::us-east-1::gb_seconds"] = CacheEntry(
        price=0.0000166667, fetched_at=old_time, source="stale_cache"
    )
    
    calculator = LambdaCostCalculator()
    node = {"_credentials": mock_credentials, "data": {"name": "test-fn"}}
    metrics_summary = {"invocations": 1_000_000, "gbSeconds": 500_000}
    
    result = calculator.calculate(node, metrics_summary, "us-east-1")
    
    # Should use stale prices and still calculate cost
    assert result["monthlyCost"] > 0
    assert result["billingModel"] == "pay-per-use"


# ─────────────────────────────────────────────────────────────────────────────
# BATCH OPERATIONS
# ─────────────────────────────────────────────────────────────────────────────

def test_get_many_batch_fetching(mock_credentials):
    """Test batch price fetching returns structured results."""
    pricing_cache.set("ec2", "us-east-1", "t3.micro", 0.0104)
    pricing_cache.set("lambda", "us-east-1", "requests", 0.20)
    
    requests = [
        ("ec2", "us-east-1", "t3.micro"),
        ("lambda", "us-east-1", "requests"),
    ]
    
    results = pricing_service.get_many(requests, mock_credentials)
    
    assert len(results) == 2
    assert results["ec2::us-east-1::t3.micro"].price == 0.0104
    assert results["lambda::us-east-1::requests"].price == 0.20
    assert all(r.source == "fresh_cache" for r in results.values())


# ─────────────────────────────────────────────────────────────────────────────
# ERROR HANDLING
# ─────────────────────────────────────────────────────────────────────────────

def test_cache_db_failure_falls_back_to_memory():
    """Test cache gracefully handles PostgreSQL failures."""
    # Simulate DB failure
    with patch('app.engines.pricing.pricing_cache.pricing_cache._db_ready', False):
        pricing_cache.set("s3", "us-east-1", "storage", 0.025)
        
        # Should still work via memory layer
        entry = pricing_cache.get_fresh("s3", "us-east-1", "storage")
        assert entry.price == 0.025


def test_pricing_service_no_credentials_uses_cache_only():
    """Test pricing service works without credentials (cache-only mode)."""
    pricing_cache.set("sqs", "us-east-1", "standard", 0.40)
    
    price = pricing_service.get("sqs", "us-east-1", "standard", credentials=None)
    
    assert price == 0.40  # Got from cache, no API call


def test_pricing_result_is_available():
    """Test PricingResult.is_available() helper."""
    available = PricingResult(price=1.23, source="fresh_cache", fetched_at=datetime.now())
    unavailable = PricingResult(price=None, source="unavailable", fetched_at=None)
    
    assert available.is_available()
    assert not unavailable.is_available()


# ─────────────────────────────────────────────────────────────────────────────
# CACHE STATISTICS
# ─────────────────────────────────────────────────────────────────────────────

def test_cache_stats():
    """Test cache statistics reporting."""
    pricing_cache.set("ec2", "us-east-1", "t3.micro", 0.01)
    
    # Inject stale entry
    old_time = datetime.now(timezone.utc) - timedelta(days=5)
    with pricing_cache._lock:
        pricing_cache._memory["lambda::old::stale"] = CacheEntry(
            price=0.5, fetched_at=old_time, source="stale_cache"
        )
    
    stats = pricing_cache.stats()
    
    assert stats["memory_entries"] == 2
    assert stats["fresh"] == 1
    assert stats["stale"] == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
