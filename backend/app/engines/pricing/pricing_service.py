"""
PricingService — fully dynamic AWS pricing fetcher with Last Known Good fallback.

Pricing Hierarchy (NO hardcoded fallback):
    Level 1 → Fresh Cache (<24h)
    Level 2 → AWS Pricing API (live)
    Level 3 → Stale Cache (any age — Last Known Good Price)
    Level 4 → Unavailable (return None)

The system NEVER uses hardcoded prices. If AWS Pricing API is unreachable
and no cached price exists, the service returns a structured "unavailable" response.

AWS Pricing API notes:
    - Client MUST connect to region_name="us-east-1"
    - Filters use location name, NOT region code ("Asia Pacific (Mumbai)")
    - ServiceCode strings: AmazonEC2, AWSLambda, AmazonS3, etc.

Public API:
    pricing_service.get(service, region, resource_type, credentials) → float | None
    pricing_service.get_detailed(service, region, resource_type, credentials) → PricingResult
    pricing_service.get_many(requests, credentials) → dict[str, PricingResult]

Structured response (PricingResult):
    {
        "price": float | None,
        "source": "fresh_cache" | "pricing_api" | "stale_cache" | "unavailable",
        "fetched_at": datetime | None
    }
"""

import json
import logging
from typing import Optional
from dataclasses import dataclass
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError, BotoCoreError

from app.engines.pricing.region_map import region_to_location
from app.engines.pricing.pricing_cache import pricing_cache, CacheEntry

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# STRUCTURED RESULT
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PricingResult:
    """Structured pricing response with metadata."""
    price: Optional[float]
    source: str  # "fresh_cache" | "pricing_api" | "stale_cache" | "unavailable"
    fetched_at: Optional[datetime]

    def is_available(self) -> bool:
        return self.price is not None


# ─────────────────────────────────────────────────────────────────────────────
# PRICING API FILTER BUILDERS
# Maps (service, resource_type) → AWS Pricing API filters
# ─────────────────────────────────────────────────────────────────────────────

def _ec2_filters(resource_type: str, location: str) -> tuple[str, list[dict]]:
    return "AmazonEC2", [
        {"Type": "TERM_MATCH", "Field": "instanceType",    "Value": resource_type},
        {"Type": "TERM_MATCH", "Field": "location",         "Value": location},
        {"Type": "TERM_MATCH", "Field": "tenancy",          "Value": "Shared"},
        {"Type": "TERM_MATCH", "Field": "operatingSystem",  "Value": "Linux"},
        {"Type": "TERM_MATCH", "Field": "preInstalledSw",   "Value": "NA"},
        {"Type": "TERM_MATCH", "Field": "capacitystatus",   "Value": "Used"},
    ]


def _ebs_filters(resource_type: str, location: str) -> tuple[str, list[dict]]:
    return "AmazonEC2", [
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Storage"},
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "volumeApiName",  "Value": resource_type},
    ]


def _lambda_requests_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSLambda", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "Serverless"},
        {"Type": "TERM_MATCH", "Field": "group",          "Value": "AWS-Lambda-Requests"},
    ]


def _lambda_duration_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSLambda", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "Serverless"},
        {"Type": "TERM_MATCH", "Field": "group",          "Value": "AWS-Lambda-Duration"},
    ]


def _s3_storage_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonS3", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "Storage"},
        {"Type": "TERM_MATCH", "Field": "storageClass",   "Value": "General Purpose"},
    ]


def _s3_put_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonS3", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "API Request"},
        {"Type": "TERM_MATCH", "Field": "group",          "Value": "S3-API-Tier1"},
    ]


def _s3_get_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonS3", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "API Request"},
        {"Type": "TERM_MATCH", "Field": "group",          "Value": "S3-API-Tier2"},
    ]


def _sqs_standard_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSQueueService", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "queueType",      "Value": "Standard"},
    ]


def _sqs_fifo_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSQueueService", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "queueType",      "Value": "FIFO"},
    ]


def _apigw_rest_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonApiGateway", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "API Calls"},
    ]


def _nat_hourly_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonVPC", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "NAT Gateway"},
        {"Type": "TERM_MATCH", "Field": "group",          "Value": "NGW-Hours"},
    ]


def _nat_data_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonVPC", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "NAT Gateway"},
        {"Type": "TERM_MATCH", "Field": "group",          "Value": "NGW-DataProcessed"},
    ]


def _eventbridge_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonEventBridge", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "Event"},
    ]


def _data_transfer_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSDataTransfer", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "transferType",   "Value": "AWS Outbound"},
    ]


def _rds_instance_filters(instance_type: str, location: str, database_engine: str = "PostgreSQL", deployment_option: str = "Single-AZ") -> tuple[str, list[dict]]:
    return "AmazonRDS", [
        {"Type": "TERM_MATCH", "Field": "productFamily",   "Value": "Database Instance"},
        {"Type": "TERM_MATCH", "Field": "instanceType",    "Value": instance_type},
        {"Type": "TERM_MATCH", "Field": "location",        "Value": location},
        {"Type": "TERM_MATCH", "Field": "databaseEngine",  "Value": database_engine},
        {"Type": "TERM_MATCH", "Field": "deploymentOption", "Value": deployment_option},
        {"Type": "TERM_MATCH", "Field": "licenseModel",     "Value": "General Public License"},
    ]


def _rds_storage_filters(volume_type: str, location: str) -> tuple[str, list[dict]]:
    vt_map = {
        "gp2": "General Purpose",
        "gp3": "General Purpose-GP3",
        "standard": "General Purpose"
    }
    vt = vt_map.get(volume_type.lower(), "General Purpose")
    return "AmazonRDS", [
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Storage"},
        {"Type": "TERM_MATCH", "Field": "volumeType",    "Value": vt},
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
    ]


def _sns_requests_filters(location: str, topic_type: str = "Standard") -> tuple[str, list[dict]]:
    group = "SNS-Requests-Standard" if topic_type.capitalize() == "Standard" else "SNS-Requests-FIFO"
    return "AmazonSNS", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "API Request"},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": group},
    ]


def _dynamodb_storage_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonDynamoDB", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Database Storage"},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "Amazon DynamoDB - Indexed Storage"},
    ]


def _dynamodb_rru_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonDynamoDB", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "DynamoDB-ReadRequestUnits"},
    ]


def _dynamodb_wru_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonDynamoDB", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "DynamoDB-WriteRequestUnits"},
    ]


def _dynamodb_rcu_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonDynamoDB", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "DDB-ReadCapacityUnit"},
    ]


def _dynamodb_wcu_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonDynamoDB", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "DDB-WriteCapacityUnit"},
    ]


def _cloudfront_requests_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonCloudFront", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Fee"},
    ]


def _cloudfront_data_transfer_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonCloudFront", [
        {"Type": "TERM_MATCH", "Field": "location",       "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily",  "Value": "Data Transfer"},
        {"Type": "TERM_MATCH", "Field": "transferType",   "Value": "CloudFront Outbound"},
    ]


def _ecs_fargate_vcpu_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonECS", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Compute"},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "Fargate-vCPU"},
    ]


def _ecs_fargate_memory_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonECS", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Compute"},
        {"Type": "TERM_MATCH", "Field": "group",         "Value": "Fargate-Memory"},
    ]


def _eks_cluster_filters(location: str) -> tuple[str, list[dict]]:
    return "AmazonEKS", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Compute"},
    ]


def _secretsmanager_secrets_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSSecretsManager", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Secret"},
    ]


def _secretsmanager_requests_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSSecretsManager", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "API Request"},
    ]


def _stepfunctions_transitions_filters(location: str) -> tuple[str, list[dict]]:
    return "AWSStepFunctions", [
        {"Type": "TERM_MATCH", "Field": "location",      "Value": location},
        {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "State Transitions"},
    ]



# ─────────────────────────────────────────────────────────────────────────────
# PRICE EXTRACTION FROM AWS PRICING API RESPONSE
# ─────────────────────────────────────────────────────────────────────────────

def _extract_on_demand_price(price_list: list[str]) -> Optional[float]:
    """
    Parse AWS Pricing API PriceList JSON and extract first on-demand USD price.
    Returns None if no valid price found.
    """
    for item_str in price_list:
        try:
            item = json.loads(item_str)
            on_demand = item.get("terms", {}).get("OnDemand", {})
            for offer in on_demand.values():
                for dim in offer.get("priceDimensions", {}).values():
                    usd = dim.get("pricePerUnit", {}).get("USD", "0")
                    price = float(usd)
                    if price > 0:
                        return price
        except (json.JSONDecodeError, ValueError, KeyError):
            continue
    return None


# ─────────────────────────────────────────────────────────────────────────────
# PRICING SERVICE
# ─────────────────────────────────────────────────────────────────────────────

class PricingService:
    """
    Fully dynamic pricing fetcher with NO hardcoded fallback.

    Pricing hierarchy:
        1. Fresh cache (<24h)
        2. AWS Pricing API
        3. Stale cache (any age — Last Known Good)
        4. Unavailable (return None)

    The service never fails but may return "unavailable" if AWS has never
    provided pricing data for a (service, region, resource_type) combination.
    """

    def __init__(self):
        self._pricing_region = "us-east-1"  # Pricing API only available here

    # ─────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────────────

    def get(
        self,
        service: str,
        region: str,
        resource_type: str,
        credentials: Optional[dict] = None,
    ) -> Optional[float]:
        """
        Get price for (service, region, resource_type).
        Returns float price or None if unavailable.

        This is the backward-compatible API for existing calculators.
        """
        result = self.get_detailed(service, region, resource_type, credentials)
        return result.price

    def get_detailed(
        self,
        service: str,
        region: str,
        resource_type: str,
        credentials: Optional[dict] = None,
    ) -> PricingResult:
        """
        Get detailed pricing result with metadata.

        Returns PricingResult with:
            - price: float | None
            - source: "fresh_cache" | "pricing_api" | "stale_cache" | "unavailable"
            - fetched_at: datetime | None
        """
        key_str = f"{service}::{region}::{resource_type}"

        # ── Level 1: Fresh Cache (<24h) ──────────────────────────────────────
        fresh = pricing_cache.get_fresh(service, region, resource_type)
        if fresh:
            logger.debug(f"[PricingService] FRESH_CACHE: {key_str} = ${fresh.price}")
            return PricingResult(
                price=fresh.price,
                source="fresh_cache",
                fetched_at=fresh.fetched_at
            )

        # ── Level 2: AWS Pricing API ──────────────────────────────────────────
        if credentials:
            api_price = self._fetch_from_api(service, region, resource_type, credentials)
            if api_price is not None:
                pricing_cache.set(service, region, resource_type, api_price)
                logger.info(f"[PricingService] PRICING_API_SUCCESS: {key_str} = ${api_price}")
                return PricingResult(
                    price=api_price,
                    source="pricing_api",
                    fetched_at=datetime.now(timezone.utc)
                )
            else:
                logger.warning(f"[PricingService] PRICING_API_FAILURE: {key_str}")

        # ── Level 3: Stale Cache (Last Known Good) ───────────────────────────
        stale = pricing_cache.get_last_known(service, region, resource_type)
        if stale:
            age_days = (datetime.now(timezone.utc) - stale.fetched_at).days
            logger.warning(
                f"[PricingService] STALE_CACHE_USED: {key_str} = ${stale.price} "
                f"(age: {age_days} days)"
            )
            return PricingResult(
                price=stale.price,
                source="stale_cache",
                fetched_at=stale.fetched_at
            )

        # ── Level 4: Unavailable ──────────────────────────────────────────────
        logger.error(f"[PricingService] PRICING_UNAVAILABLE: {key_str}")
        return PricingResult(
            price=None,
            source="unavailable",
            fetched_at=None
        )

    def get_many(
        self,
        requests: list[tuple[str, str, str]],
        credentials: Optional[dict] = None,
    ) -> dict[str, PricingResult]:
        """
        Batch fetch multiple prices.

        Args:
            requests: list of (service, region, resource_type) tuples
            credentials: AWS credentials

        Returns: { "service::region::resource_type": PricingResult }
        """
        results = {}
        for service, region, resource_type in requests:
            key = pricing_cache.make_key(service, region, resource_type)
            results[key] = self.get_detailed(service, region, resource_type, credentials)
        return results

    def get_ec2_instance_price(
        self,
        instance_type: str,
        region: str,
        credentials: Optional[dict] = None,
    ) -> Optional[float]:
        """Convenience wrapper for EC2 on-demand hourly price."""
        return self.get("ec2", region, instance_type, credentials)

    def cache_stats(self) -> dict:
        """Return cache health statistics."""
        return pricing_cache.stats()

    # ─────────────────────────────────────────────────────────────────────────
    # LIVE API FETCH (Level 2)
    # ─────────────────────────────────────────────────────────────────────────

    def _fetch_from_api(
        self,
        service: str,
        region: str,
        resource_type: str,
        credentials: dict,
    ) -> Optional[float]:
        """
        Call AWS Pricing API and parse the price.
        Returns None on any error (network, auth, throttle, parse).
        """
        location = region_to_location(region)
        if not location:
            logger.warning(f"[PricingService] Unknown region '{region}' — no location mapping")
            return None

        try:
            client = self._get_pricing_client(credentials)
            service_code, filters = self._build_filters(service, resource_type, location)

            if not service_code:
                return None

            response = client.get_products(
                ServiceCode=service_code,
                Filters=filters,
                MaxResults=5,
            )

            price = _extract_on_demand_price(response.get("PriceList", []))
            if price is None:
                logger.warning(
                    f"[PricingService] API returned no price for {service}::{region}::{resource_type}"
                )
            return price

        except (ClientError, BotoCoreError) as e:
            logger.error(f"[PricingService] API call failed: {e}")
            return None
        except Exception as e:
            logger.error(f"[PricingService] Unexpected error: {e}")
            return None

    def _build_filters(
        self,
        service: str,
        resource_type: str,
        location: str,
    ) -> tuple[str, list[dict]]:
        """
        Map (service, resource_type) → (ServiceCode, Filters).
        Returns ("", []) if unsupported.
        """
        # EC2 and EBS use instance/volume type directly
        if service == "ec2":
            return _ec2_filters(resource_type, location)
        if service == "ebs":
            return _ebs_filters(resource_type, location)

        # RDS dynamic resource type parsing
        if service == "rds":
            if resource_type.startswith("instance:"):
                # Format: instance:instance_class:database_engine:deployment_option
                parts = resource_type.split(":")
                instance_class = parts[1]
                engine = parts[2]
                deployment = parts[3]
                return _rds_instance_filters(instance_class, location, engine, deployment)
            elif resource_type.startswith("storage:"):
                volume_type = resource_type.split(":")[1]
                return _rds_storage_filters(volume_type, location)

        # SNS requests parsing
        if service == "sns":
            topic_type = resource_type.split(":")[1] if ":" in resource_type else "Standard"
            return _sns_requests_filters(location, topic_type)

        # All other services use fixed resource_type keys
        dispatch = {
            ("lambda",       "requests"):   lambda: _lambda_requests_filters(location),
            ("lambda",       "gb_seconds"): lambda: _lambda_duration_filters(location),
            ("s3",           "storage"):    lambda: _s3_storage_filters(location),
            ("s3",           "put"):        lambda: _s3_put_filters(location),
            ("s3",           "get"):        lambda: _s3_get_filters(location),
            ("sqs",          "standard"):   lambda: _sqs_standard_filters(location),
            ("sqs",          "fifo"):       lambda: _sqs_fifo_filters(location),
            ("apigateway",   "rest"):       lambda: _apigw_rest_filters(location),
            ("nat_gateway",  "hourly"):     lambda: _nat_hourly_filters(location),
            ("nat_gateway",  "data"):       lambda: _nat_data_filters(location),
            ("eventbridge",  "events"):     lambda: _eventbridge_filters(location),
            ("data_transfer","out"):        lambda: _data_transfer_filters(location),
            
            # New services
            ("dynamodb",     "storage"):    lambda: _dynamodb_storage_filters(location),
            ("dynamodb",     "rru"):        lambda: _dynamodb_rru_filters(location),
            ("dynamodb",     "wru"):        lambda: _dynamodb_wru_filters(location),
            ("dynamodb",     "rcu_hourly"): lambda: _dynamodb_rcu_filters(location),
            ("dynamodb",     "wcu_hourly"): lambda: _dynamodb_wcu_filters(location),
            ("cloudfront",   "requests"):   lambda: _cloudfront_requests_filters(location),
            ("cloudfront",   "transfer"):   lambda: _cloudfront_data_transfer_filters(location),
            ("ecs",          "fargate_vcpu"):   lambda: _ecs_fargate_vcpu_filters(location),
            ("ecs",          "fargate_memory"): lambda: _ecs_fargate_memory_filters(location),
            ("eks",          "cluster"):     lambda: _eks_cluster_filters(location),
            ("secretsmanager", "secrets"):   lambda: _secretsmanager_secrets_filters(location),
            ("secretsmanager", "requests"):  lambda: _secretsmanager_requests_filters(location),
            ("stepfunctions", "transitions"): lambda: _stepfunctions_transitions_filters(location),
        }

        handler = dispatch.get((service, resource_type))
        if handler:
            return handler()

        logger.debug(f"[PricingService] No API filter for {service}::{resource_type}")
        return "", []

    # ─────────────────────────────────────────────────────────────────────────
    # BOTO3 CLIENT
    # ─────────────────────────────────────────────────────────────────────────

    def _get_pricing_client(self, credentials: dict):
        """Create Pricing API client (MUST use us-east-1 region)."""
        return boto3.client(
            "pricing",
            region_name=self._pricing_region,
            aws_access_key_id=credentials.get("AccessKeyId"),
            aws_secret_access_key=credentials.get("SecretAccessKey"),
            aws_session_token=credentials.get("SessionToken"),
        )


# ── Singleton ─────────────────────────────────────────────────────────────────
pricing_service = PricingService()
