# Pricing System Refactoring — NO Hardcoded Fallback

## Overview

This refactoring **completely removes all hardcoded pricing tables** from Nebula Lens and replaces them with a **Last Known Good Price** strategy.

---

## What Changed

### Before (3-level fallback with hardcoded prices)
```
Fresh Cache (24h) → AWS Pricing API → Hardcoded _FALLBACK dict
```
- If the Pricing API failed, the system always had hardcoded prices to fall back on
- Hardcoded prices required manual updates when AWS changed pricing
- No way to distinguish between "real AWS price" and "fallback approximation"

### After (4-level hierarchy with stale cache)
```
Fresh Cache (<24h) → AWS Pricing API → Stale Cache (any age) → Unavailable
```
- **NO hardcoded prices at all**
- Stale cache entries (e.g. 30-day-old AWS prices) are preferred over unavailability
- When pricing is truly unavailable, calculators receive `None` and return `$0` cost
- System logs exactly where each price came from (fresh_cache | pricing_api | stale_cache | unavailable)

---

## Architecture

### Pricing Hierarchy

**Level 1: Fresh Cache (<24h old)**
- Memory layer (L1) + PostgreSQL (L2)
- Sub-millisecond L1 lookups
- Survives application restarts via L2
- TTL: 24 hours

**Level 2: AWS Pricing API**
- Live `boto3` call to `pricing.get_products()`
- Must connect to `us-east-1` (Pricing API only available there)
- Uses region mapping: `ap-south-1` → `"Asia Pacific (Mumbai)"`
- On success: writes to cache → returns price
- On failure: falls through to Level 3

**Level 3: Stale Cache (Last Known Good Price)**
- Returns most recent cached AWS price regardless of age
- Example: 30-day-old price is better than no price
- This ensures cost analysis never fails due to temporary API outages

**Level 4: Unavailable**
- Only reached if AWS has **never** returned a price for this (service, region, resource_type)
- Returns `PricingResult(price=None, source="unavailable", fetched_at=None)`
- Calculators handle this by using `or 0.0` → cost becomes $0

---

## API Changes

### PricingService Public API

**Backward-compatible method (returns float | None)**
```python
price = pricing_service.get("ec2", "us-east-1", "t3.medium", credentials)
# Returns: 0.0416 | None
```

**New structured method (returns PricingResult)**
```python
result = pricing_service.get_detailed("ec2", "us-east-1", "t3.medium", credentials)
# Returns: PricingResult(price=0.0416, source="fresh_cache", fetched_at=datetime(...))
```

**Batch fetching**
```python
requests = [
    ("ec2", "us-east-1", "t3.medium"),
    ("lambda", "us-east-1", "requests"),
]
results = pricing_service.get_many(requests, credentials)
# Returns: { "ec2::us-east-1::t3.medium": PricingResult(...), ... }
```

### PricingCache API

**Fresh cache retrieval (<24h)**
```python
entry = pricing_cache.get_fresh("ec2", "us-east-1", "t3.medium")
# Returns: CacheEntry(price=0.0416, fetched_at=..., source="fresh_cache") | None
```

**Stale cache retrieval (any age — Last Known Good)**
```python
entry = pricing_cache.get_last_known("lambda", "us-east-1", "requests")
# Returns: CacheEntry(price=0.20, fetched_at=30_days_ago, source="stale_cache") | None
```

**Write to cache**
```python
pricing_cache.set("s3", "us-east-1", "storage", 0.025)
# Writes to both memory (L1) and PostgreSQL (L2)
```

---

## Database

### Schema

No schema changes required. Table already exists:

```sql
CREATE TABLE pricing_cache (
    cache_key   TEXT PRIMARY KEY,           -- "service::region::resource_type"
    price       DOUBLE PRECISION NOT NULL,  -- USD per unit
    fetched_at  TIMESTAMPTZ NOT NULL        -- when AWS returned this price
);
```

### Example Queries

**Check fresh vs stale entries:**
```sql
SELECT 
    cache_key,
    price,
    fetched_at,
    CASE 
        WHEN fetched_at > NOW() - INTERVAL '24 hours' THEN 'fresh'
        ELSE 'stale'
    END AS status
FROM pricing_cache
ORDER BY fetched_at DESC;
```

**Find oldest cached prices:**
```sql
SELECT cache_key, price, fetched_at,
       AGE(NOW(), fetched_at) AS age
FROM pricing_cache
ORDER BY fetched_at ASC
LIMIT 10;
```

**Clear all stale entries (optional maintenance):**
```sql
DELETE FROM pricing_cache
WHERE fetched_at < NOW() - INTERVAL '30 days';
```

---

## Cost Calculator Changes

All calculators now use `or 0.0` to handle `None` prices:

### Before
```python
hourly_rate = pricing_service.get("ec2", region, instance_type, credentials)
# Would crash if None returned
```

### After
```python
hourly_rate = pricing_service.get("ec2", region, instance_type, credentials) or 0.0
# Returns 0.0 if pricing unavailable — no crash
```

This change is in:
- `ec2_cost.py`
- `lambda_cost.py`
- `s3_cost.py`
- `sqs_cost.py`
- `apigateway_cost.py`
- `vpc_cost.py`
- `eventbridge_cost.py`

---

## Logging

### Log Levels

**DEBUG** — Cache hits (both fresh and stale)
```
[PricingCache] FRESH L1 HIT: ec2::us-east-1::t3.medium = $0.0416
```

**INFO** — Pricing API success, stale cache warm
```
[PricingService] PRICING_API_SUCCESS: lambda::us-east-1::requests = $0.20
```

**WARNING** — Stale cache usage (API failed but we have old data)
```
[PricingService] STALE_CACHE_USED: nat_gateway::us-west-2::hourly = $0.048 (age: 7 days)
```

**ERROR** — Pricing unavailable (no cache, no API)
```
[PricingService] PRICING_UNAVAILABLE: dynamodb::eu-west-1::read_units
```

### Log Aggregation Query

To find all pricing unavailability incidents:
```bash
grep "PRICING_UNAVAILABLE" backend.log | wc -l
```

To find services using stale pricing:
```bash
grep "STALE_CACHE_USED" backend.log | awk -F: '{print $NF}' | sort | uniq -c
```

---

## Testing

### Run All Tests
```bash
cd backend
pytest tests/test_pricing_refactored.py -v
```

### Key Test Scenarios

1. **Fresh cache hit** — no API call, instant response
2. **API success** — writes to cache, returns live price
3. **Stale fallback** — API fails, uses 30-day-old cached price
4. **Unavailable** — no cache, no API → returns None
5. **Calculator resilience** — handles None prices gracefully

### Manual Integration Test

```bash
cd backend
python3 << 'EOF'
from app.engines.pricing import pricing_service

# Mock credentials (replace with real role ARN credentials)
creds = {
    "AccessKeyId": "AKIATEST",
    "SecretAccessKey": "SECRET",
    "SessionToken": "TOKEN"
}

# Test EC2 pricing
result = pricing_service.get_detailed("ec2", "us-east-1", "t3.medium", creds)
print(f"Price: ${result.price}, Source: {result.source}, Age: {result.fetched_at}")

# Test cache stats
print(pricing_service.cache_stats())
EOF
```

---

## Migration Strategy

### Step 1: Deploy Refactored Code
- All files have been updated
- No database migrations required (table already exists)
- Backward compatible — existing scans will continue working

### Step 2: Initial Cache Warm-Up (Optional)
Run a single scan across all regions to populate cache:
```bash
# Trigger a full scan via API
curl -X POST http://localhost:8001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"account_id": "your-account-id"}'
```

This will:
1. Query AWS Pricing API for all active resources
2. Cache prices for 24 hours
3. Subsequent scans will hit cache (no API calls for 24h)

### Step 3: Monitor Logs
Watch for `PRICING_UNAVAILABLE` errors:
```bash
tail -f backend/logs/app.log | grep PRICING_UNAVAILABLE
```

If you see unavailable pricing for a service you care about:
- Check if that service/region combo is valid
- Verify IAM role has `pricing:GetProducts` permission
- Check AWS Pricing API quotas

### Step 4: Performance Validation
- Expected: 99% cache hit rate after initial warm-up
- Expected: <1ms latency for cached prices
- Expected: ~500ms latency for live Pricing API calls (first time only)

---

## Error Handling

### Scenario: AWS Pricing API Rate Limit

**Symptom:**
```
[PricingService] API call failed: Rate exceeded
```

**Behavior:**
- System falls back to stale cache (Last Known Good)
- Cost analysis continues with slightly outdated prices
- No user-facing error

**Resolution:**
- Automatic — cache prevents repeated API calls
- If persistent: contact AWS support to increase Pricing API quota

### Scenario: Network Partition (API unreachable)

**Symptom:**
```
[PricingService] API call failed: Network timeout
```

**Behavior:**
- System uses stale cache for all pricing
- Cost estimates remain available (slightly outdated)
- Logs warning but does NOT crash

**Resolution:**
- Automatic — stale cache valid until network restored
- Once network returns, next scan will refresh cache

### Scenario: New AWS Region Without Cached Prices

**Symptom:**
```
[PricingService] PRICING_UNAVAILABLE: ec2::ap-southeast-5::t3.micro
```

**Behavior:**
- Calculator receives `None` → uses `or 0.0` → cost becomes $0
- First scan of that region shows $0 costs
- Second scan (24h later or after cache refresh) will have real prices

**Resolution:**
- Trigger a manual scan to force Pricing API call
- Or wait for scheduled scan to populate cache

---

## Performance Optimizations

### 1. Cache Pre-Warming Script

Create a background job to refresh pricing daily:

```python
# backend/scripts/warm_pricing_cache.py
from app.engines.pricing import pricing_service

COMMON_RESOURCES = [
    ("ec2", "us-east-1", "t3.micro"),
    ("ec2", "us-east-1", "t3.medium"),
    ("lambda", "us-east-1", "requests"),
    ("s3", "us-east-1", "storage"),
    # ... add your most-used resources
]

def warm_cache(credentials):
    for service, region, resource_type in COMMON_RESOURCES:
        pricing_service.get(service, region, resource_type, credentials)
        
# Run daily via cron: 0 2 * * * python warm_pricing_cache.py
```

### 2. Batch Pricing Fetches

When scanning multiple resources, batch pricing requests:

```python
# Instead of:
for instance in instances:
    price = pricing_service.get("ec2", region, instance.type, creds)

# Do this:
requests = [(\"ec2\", region, inst.type) for inst in instances]
prices = pricing_service.get_many(requests, creds)
```

### 3. Monitor Cache Hit Rate

```python
stats = pricing_service.cache_stats()
hit_rate = stats["fresh"] / (stats["fresh"] + stats["stale"]) * 100
print(f"Cache hit rate: {hit_rate:.1f}%")
```

Target: >95% fresh cache hit rate after initial warm-up

---

## Future Enhancements

### 1. Support Reserved Instance Pricing

Currently only on-demand pricing is fetched. To add RI pricing:

```python
def _ec2_ri_filters(instance_type: str, location: str, term: str) -> tuple[str, list[dict]]:
    return "AmazonEC2", [
        {"Type": "TERM_MATCH", "Field": "instanceType", "Value": instance_type},
        {"Type": "TERM_MATCH", "Field": "location", "Value": location},
        {"Type": "TERM_MATCH", "Field": "termType", "Value": "Reserved"},
        {"Type": "TERM_MATCH", "Field": "leaseContractLength", "Value": term},  # "1yr" | "3yr"
    ]
```

### 2. Savings Plans Cost Modeling

Add a `SavingsPlanCalculator` that applies discount percentages to on-demand prices.

### 3. Multi-Region Cost Comparison

```python
regions = ["us-east-1", "us-west-2", "ap-south-1"]
prices = {r: pricing_service.get("ec2", r, "t3.medium", creds) for r in regions}
cheapest = min(prices, key=prices.get)
print(f"Cheapest region: {cheapest} at ${prices[cheapest]}/hr")
```

### 4. Historical Price Tracking

Modify cache table to keep history:

```sql
ALTER TABLE pricing_cache ADD COLUMN version INTEGER DEFAULT 1;
-- Don't delete old entries, increment version instead
```

---

## Troubleshooting

### Issue: All prices showing as $0

**Check 1:** Verify credentials have Pricing API permission
```bash
aws pricing get-products \
  --service-code AmazonEC2 \
  --filters Type=TERM_MATCH,Field=location,Value="US East (N. Virginia)" \
  --max-results 1
```

**Check 2:** Check cache
```sql
SELECT COUNT(*) FROM pricing_cache;
-- Should be > 0 after first scan
```

**Check 3:** Check logs for PRICING_UNAVAILABLE
```bash
grep PRICING_UNAVAILABLE backend.log
```

### Issue: Stale prices (cache never refreshing)

**Check 1:** Verify scans are running
```sql
SELECT MAX(fetched_at) FROM pricing_cache;
-- Should be within last 24 hours
```

**Check 2:** Force cache invalidation
```python
from app.engines.pricing.pricing_cache import pricing_cache
pricing_cache.invalidate("ec2", "us-east-1", "t3.medium")
```

### Issue: High latency on first scan

**Expected:** First scan of a new region will be slower (live API calls)

**Solution:** Pre-warm cache or accept initial slowness

---

## Summary

### What Was Removed
- Entire `_FALLBACK` dictionary from `pricing_service.py`
- All hardcoded price constants
- Fallback pricing logic

### What Was Added
- `CacheEntry` dataclass with `source` and `fetched_at` metadata
- `PricingResult` structured response
- `pricing_cache.get_last_known()` for stale cache retrieval
- Graceful None handling in all calculators (`or 0.0`)
- Comprehensive logging (fresh_cache, pricing_api, stale_cache, unavailable)
- 35+ unit + integration tests

### Benefits
1. **Zero maintenance** — prices update automatically from AWS
2. **Regional accuracy** — every region gets correct pricing
3. **High availability** — stale cache prevents outages
4. **Full observability** — know exactly where each price came from
5. **Future-proof** — new services/regions work automatically

### Trade-offs
1. **Requires AWS Pricing API access** — IAM role must have `pricing:GetProducts`
2. **First scan slower** — initial cache population takes time
3. **$0 costs possible** — when pricing unavailable, cost shows as $0 (logged as error)

---

## Contact

For questions or issues with the refactored pricing system, check:
- Logs: `grep PricingService backend.log`
- Tests: `pytest backend/tests/test_pricing_refactored.py -v`
- Cache stats: `pricing_service.cache_stats()`
