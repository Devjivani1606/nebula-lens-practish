"""
Metrics + Cost Analysis Router

POST /api/analyze/account
  → Fetches latest snapshot nodes from DB
  → Runs MetricsEngine (CloudWatch) on each node
  → Runs CostEngine on each node
  → Returns enriched nodes with telemetryData + cost

GET /api/analyze/health
  → Shows which services are registered in both engines
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from uuid import UUID as UUIDClass

from app.database import get_db
from app.models.models import AwsAccount, Snapshot, Resource
from app.services.aws_service import aws_service
from app.engines.metrics_engine import metrics_engine
from app.engines.cost_engine import cost_engine
from app.utils.topology import normalize_topology_nodes
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analyze", tags=["Metrics & Cost Analysis"])


# ─────────────────────────────────────────
# REQUEST / RESPONSE
# ─────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    account_id: str          # AWS 12-digit account ID or DB UUID
    period_hours: Optional[int] = 24   # CloudWatch lookback window


# ─────────────────────────────────────────
# HEALTH — shows registered services
# ─────────────────────────────────────────

@router.get("/health")
def analyze_health():
    """Shows registered services and current cache stats."""
    return {
        "status": "ready",
        "metricsEngine": {
            "supportedServices": metrics_engine.supported_services(),
            "cacheStats":        metrics_engine.cache_stats(),
        },
        "costEngine": {
            "supportedServices": cost_engine.supported_services()
        }
    }


@router.get("/services")
def get_service_info(service: str = None):
    """
    Inspect the Metrics Mapping Layer.

    Returns for each service:
      - CloudWatch namespace
      - Collected metrics (METRICS_PLAN)
      - Deliberately ignored metrics (IGNORE_METRICS)
      - Telemetry chart schema

    Use ?service=lambda to filter to a single service.
    """
    if service:
        return metrics_engine.service_info(service.lower())
    return metrics_engine.all_service_info()


# ─────────────────────────────────────────
# MAIN ANALYZE ENDPOINT
# ─────────────────────────────────────────

@router.post("/account")
def analyze_account(request: AnalyzeRequest, db: Session = Depends(get_db)):
    """
    Full pipeline:
      1. Find account → latest snapshot → all resources
      2. Get AWS credentials (assume role)
      3. Run MetricsEngine per node  (CloudWatch)
      4. Run CostEngine per node     (cost formula)
      5. Return enriched nodes with telemetryData + cost

    NOTE: Services with no CloudWatch data (subnet) return static metadata.
          VPC returns NAT Gateway aggregated metrics.
    """
    try:
        # ── Step 1: Find Account ──────────────────────────────────────────────
        parsed_uuid = None
        try:
            parsed_uuid = UUIDClass(request.account_id)
        except ValueError:
            pass

        query = db.query(AwsAccount)
        if parsed_uuid:
            account = query.filter(
                or_(AwsAccount.id == parsed_uuid,
                    AwsAccount.account_id == request.account_id)
            ).first()
        else:
            account = query.filter(
                AwsAccount.account_id == request.account_id
            ).first()

        if not account:
            raise HTTPException(status_code=404, detail=f"Account {request.account_id} not found")

        logger.info(f"[Analyze] Account: {account.account_name} ({account.account_id})")

        # ── Step 2: Get Latest Snapshot ───────────────────────────────────────
        snapshot = db.query(Snapshot).filter(
            Snapshot.account_id == account.id,
            Snapshot.is_latest == True
        ).first()

        if not snapshot:
            raise HTTPException(status_code=404, detail="No snapshots found for this account")

        # ── Step 3: Get Resources ─────────────────────────────────────────────
        SUPPORTED = {"vpc", "subnet", "ec2", "lambda", "rds", "sqs", "s3", "apigateway"}
        resources = db.query(Resource).filter(
            Resource.snapshot_id == snapshot.id,
            Resource.service.in_(SUPPORTED)
        ).all()

        if not resources:
            return {
                "success": True,
                "message": "No supported resources found in latest snapshot",
                "nodes": [],
                "totalMonthlyCost": 0.0,
                "costSummary": {}
            }

        logger.info(f"[Analyze] Found {len(resources)} resources in snapshot v{snapshot.version_number}")

        # ── Step 4: Get AWS Credentials (needed for CloudWatch) ───────────────
        credentials = None
        cw_available = False
        try:
            credentials = aws_service._get_temp_credentials(account.role_arn)
            cw_available = credentials is not None
            if not cw_available:
                logger.warning("[Analyze] Could not get AWS credentials — metrics will be empty")
        except Exception as e:
            logger.warning(f"[Analyze] Credential fetch failed: {e} — running cost-only mode")

        # ── Step 5: Build node dicts (same format MetricsEngine expects) ──────
        nodes = []
        for r in resources:
            meta = r.meta_data or {}
            node = {
                "id": r.resource_arn,
                "type": r.node_type,
                "position": {"x": 0, "y": 0},
                "data": {
                    "name": r.resource_name,
                    "service": r.service,
                    "region": r.region,
                    "account_id": r.account_id,
                    "resource_arn": r.resource_arn,
                    "insights": meta.get("insights", ""),
                    "metrics": meta.get("metrics", {}),
                    "tags": meta.get("tags", {}),
                }
            }
            if r.parent_node_id:
                node["parentID"] = r.parent_node_id
                node["parentId"] = r.parent_node_id
            nodes.append(node)

        nodes = normalize_topology_nodes(nodes)

        # ── Step 6: Run MetricsEngine ─────────────────────────────────────────
        # Group nodes by region so we make one CW client per region
        region_groups: dict[str, list] = {}
        for node in nodes:
            rgn = node["data"]["region"]
            region_groups.setdefault(rgn, []).append(node)

        metrics_results: dict[str, dict] = {}

        if cw_available:
            for region, region_nodes in region_groups.items():
                logger.info(f"[Analyze] Running MetricsEngine for {len(region_nodes)} nodes in {region}")
                region_metrics = metrics_engine.collect_all(
                    region_nodes, credentials, region,
                    period_hours=request.period_hours
                )
                metrics_results.update(region_metrics)
        else:
            # No credentials — fill with empty summaries so CostEngine still runs
            for node in nodes:
                arn = node["id"]
                metrics_results[arn] = {
                    "service":       node["data"]["service"],
                    "cloudwatch":    {},
                    "telemetryData": [],
                    "summary":       {},
                    "errors":        ["CloudWatch unavailable — no AWS credentials"],
                    "schema":        []
                }

        # ── Step 7: Run CostEngine ────────────────────────────────────────────
        # Use the first region found as primary region for pricing
        primary_region = list(region_groups.keys())[0] if region_groups else "ap-south-1"

        logger.info(f"[Analyze] Running CostEngine for {len(nodes)} nodes...")
        cost_results = cost_engine.calculate_all(nodes, metrics_results, region=primary_region, credentials=credentials)

        # ── Step 8: Merge everything into enriched nodes ──────────────────────
        enriched_nodes = []
        for node in nodes:
            arn     = node["id"]
            service = node["data"]["service"]

            m_result = metrics_results.get(arn, {})
            c_result = cost_results.get(arn, {})

            enriched = {
                **node,
                "data": {
                    **node["data"],
                    # Inject telemetry into node.data (same location frontend expects)
                    "telemetryData": m_result.get("telemetryData", []),
                    "metricsSummary": m_result.get("summary", {}),
                    "telemetrySchema": m_result.get("schema", []),
                    "cloudwatchErrors": m_result.get("errors", []),
                    # Cost data
                    "cost": {
                        "source":           c_result.get("source", "pricing-api"),
                        "confidence":       c_result.get("confidence", "estimated"),
                        "billingModel":     c_result.get("billingModel", "unknown"),
                        "dailyCost":        c_result.get("dailyCost", 0.0),
                        "monthlyCost":      c_result.get("monthlyCost", 0.0),
                        "yearlyCost":       c_result.get("yearlyCost", 0.0),
                        "currency":         c_result.get("currency", "USD"),
                        "usageMetrics":     c_result.get("usageMetrics", {}),
                        "lineItems":        c_result.get("lineItems", []),
                        "notes":            c_result.get("notes", ""),
                    }
                }
            }
            enriched_nodes.append(enriched)

        # ── Step 9: Build cost summary ────────────────────────────────────────
        total_cost = cost_engine.total_cost(cost_results)

        cost_by_service: dict[str, float] = {}
        for arn, cr in cost_results.items():
            svc = cr.get("service", "unknown")
            cost_by_service[svc] = round(
                cost_by_service.get(svc, 0.0) + cr.get("monthlyCost", 0.0), 4
            )

        logger.info(
            f"[Analyze] Complete. {len(enriched_nodes)} nodes enriched. "
            f"Total estimated cost: ${total_cost}/month"
        )

        return {
            "success":          True,
            "message":          f"Analysis complete for snapshot v{snapshot.version_number}",
            "accountName":      account.account_name,
            "snapshotVersion":  snapshot.version_number,
            "totalNodes":       len(enriched_nodes),
            "cloudwatchMode":   "live" if cw_available else "unavailable",
            "nodes":            enriched_nodes,
            "totalMonthlyCost": total_cost,
            "costSummary":      cost_by_service,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Analyze] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
