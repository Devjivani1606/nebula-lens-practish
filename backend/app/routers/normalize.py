# Normalization Route - Fetches data from DB, normalizes, and enriches with Metrics + Cost

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_
from uuid import UUID as UUIDClass
from app.database import get_db
from app.models.models import AwsAccount, Snapshot, Resource, Relationship, NormalizedNode, NormalizedEdge
from app.engines.normalizer import NormalizationEngine
from app.engines.metrics_engine import metrics_engine
from app.engines.cost_engine import cost_engine
from app.services.aws_service import aws_service
from app.utils.topology import normalize_topology_nodes
import logging
import json

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/normalize", tags=["Normalization"])

# ─────────────────────────────────────────
# REQUEST/RESPONSE SCHEMAS
# ─────────────────────────────────────────

class NormalizeAccountRequest(BaseModel):
    """Request to normalize an account's latest snapshot"""
    account_id: Optional[str] = None
    only_new: Optional[bool] = False
    include_metrics: Optional[bool] = True   # Run MetricsEngine (CloudWatch telemetry)
    include_cost: Optional[bool] = True      # Run CostEngine (estimated monthly cost)


class NormalizedResourceResponse(BaseModel):
    """Single normalized resource"""
    node: Dict[str, Any]
    fingerprint: str
    resource_arn: str


class NormalizeAccountResponse(BaseModel):
    """Response with normalized account data — includes telemetry + cost in every node"""
    success: bool
    message: str
    account_name: Optional[str] = None
    snapshot_version: Optional[int] = None
    total_resources: int = 0
    nodes: List[Dict[str, Any]] = []      # Each node.data has telemetryData + cost injected
    edges: List[Dict[str, Any]] = []
    total_monthly_cost: float = 0.0       # Sum of all node costs (USD/month)
    cost_summary: Dict[str, float] = {}  # { "lambda": 2.45, "ec2": 48.20, ... }
    cloudwatch_mode: str = "skipped"     # "live" | "unavailable" | "skipped"


# ─────────────────────────────────────────
# INITIALIZE NORMALIZER
# ─────────────────────────────────────────

normalizer = NormalizationEngine()


# ─────────────────────────────────────────
# NORMALIZE ACCOUNT - FETCH FROM DB
# ─────────────────────────────────────────

@router.post("/account", response_model=NormalizeAccountResponse)
def normalize_account(
    request: NormalizeAccountRequest,
    db: Session = Depends(get_db)
):
    """
    Fetch latest snapshot for an AWS account from database
    and normalize all resources into React Flow format.
    
    Input: account_id (AWS 12-digit or database UUID)
    Returns: Normalized nodes and edges ready for visualization.
    
    NOTE:
    - Only supported services are returned (vpc, subnet, ec2, lambda, rds, sqs, s3, apigateway).
    - VPC and Subnet are included as nodes (for hierarchy nesting via parentID)
      but are NEVER used as edge source or target.
    - Edges only represent real communication flows: invokes, triggers, writes_to, etc.
    """
    try:
        # Step 1: Find the AWS account and latest snapshot
        if request.account_id:
            parsed_uuid = None
            try:
                parsed_uuid = UUIDClass(request.account_id)
            except ValueError:
                parsed_uuid = None

            query = db.query(AwsAccount)
            if parsed_uuid:
                account = query.filter(
                    or_(
                        AwsAccount.id == parsed_uuid,
                        AwsAccount.account_id == request.account_id,
                    )
                ).first()
            else:
                account = query.filter(AwsAccount.account_id == request.account_id).first()

            if not account:
                raise HTTPException(
                    status_code=404,
                    detail=f"AWS Account {request.account_id} not found"
                )

            logger.info(f"Found account: {account.account_name} ({account.account_id})")

            # Step 2: Get latest snapshot for this account
            latest_snapshot = db.query(Snapshot).filter(
                Snapshot.account_id == account.id,
                Snapshot.is_latest == True
            ).first()
        else:
            # Get the latest snapshot overall
            latest_snapshot = db.query(Snapshot).filter(
                Snapshot.is_latest == True
            ).order_by(Snapshot.created_at.desc()).first()

            if latest_snapshot:
                account = db.query(AwsAccount).filter(AwsAccount.id == latest_snapshot.account_id).first()
            else:
                account = None

        if not latest_snapshot or not account:
            return NormalizeAccountResponse(
                success=False,
                message="No snapshots found in the database",
                total_resources=0,
                nodes=[],
                edges=[]
            )

        logger.info(f"Found snapshot version {latest_snapshot.version_number}")

        # Step 3: Fetch all resources from snapshot
        # Only include the supported services — ignore anything else from old scans
        SUPPORTED_SERVICES = {"vpc", "subnet", "ec2", "lambda", "rds", "sqs", "s3", "apigateway", "eventbridge"}

        resources = db.query(Resource).filter(
            Resource.snapshot_id == latest_snapshot.id,
            Resource.service.in_(SUPPORTED_SERVICES)
        ).all()

        if request.only_new:
            # Find the previous snapshot for this account
            previous_snapshot = db.query(Snapshot).filter(
                Snapshot.account_id == account.id,
                Snapshot.version_number < latest_snapshot.version_number
            ).order_by(Snapshot.version_number.desc()).first()

            if previous_snapshot:
                # Find all node IDs from the previous snapshot
                previous_resources = db.query(Resource).filter(
                    Resource.snapshot_id == previous_snapshot.id
                ).all()
                previous_node_ids = {r.node_id for r in previous_resources}
                
                # Filter resources to only those that were NOT present in the previous snapshot
                resources = [r for r in resources if r.node_id not in previous_node_ids]

        if not resources:
            return NormalizeAccountResponse(
                success=True,
                message=f"Snapshot has no supported resources",
                account_name=account.account_name,
                snapshot_version=latest_snapshot.version_number,
                total_resources=0,
                nodes=[],
                edges=[]
            )

        logger.info(f"Found {len(resources)} supported resources in snapshot")

        # Step 4: Normalize each resource into React Flow node format
        nodes = []
        arn_to_node = {}

        # Collect VPC and Subnet ARNs — these are NEVER edge endpoints,
        # they only appear as nodes for hierarchy (parentID nesting)
        vpc_subnet_arns = set()

        resource_node_ids = {r.node_id for r in resources}

        for resource in resources:
            try:
                metadata = resource.meta_data or {}
                region = resource.region
                service = resource.service
                node_type = resource.node_type

                node = {
                    "id": resource.resource_arn,
                    "type": node_type,
                    "position": {"x": 0, "y": 0},
                    "data": {
                        "name": resource.resource_name,
                        "service": service,
                        "region": region,
                        "account_id": resource.account_id,
                        "resource_arn": resource.resource_arn,
                        "insights": metadata.get("insights", ""),
                        "metrics": metadata.get("metrics", {}),
                        "tags": metadata.get("tags", {})
                    }
                }

                # Add parentID for hierarchy nesting (VPC→Subnet, Subnet→EC2/Lambda/RDS)
                if resource.parent_node_id:
                    # Only assign parentID if the parent resource is in our list of resources to return
                    if resource.parent_node_id in resource_node_ids:
                        node["parentID"] = resource.parent_node_id
                        node["parentId"] = resource.parent_node_id

                nodes.append(node)
                arn_to_node[resource.resource_arn] = node

                # Mark VPC and Subnet ARNs so we can exclude them from edges
                if service in ("vpc", "subnet"):
                    vpc_subnet_arns.add(resource.resource_arn)

                logger.info(f"✓ Normalized: {node_type} - {resource.resource_name}")

            except Exception as e:
                logger.error(f"✗ Failed to normalize resource {resource.node_id}: {str(e)}")
                continue

        # Step 5: Compute edges from node metadata (no AWS calls, works immediately)
        # Also merges any edges stored in DB relationships table.
        # VPC/Subnet are NEVER edge endpoints — hierarchy is via parentId.
        edges = []
        seen_edge_keys = set()

        def make_edge(src, tgt, label, confidence, evidence, edge_id=None):
            """Build edge dict and deduplicate by (source, target, label)."""
            key = (src, tgt, label)
            if key in seen_edge_keys:
                return
            if src in vpc_subnet_arns or tgt in vpc_subnet_arns:
                return
            if src not in arn_to_node or tgt not in arn_to_node:
                return
            seen_edge_keys.add(key)
            eid = edge_id or f"edge-{src[-10:]}-{tgt[-10:]}"
            edges.append({
                "id": eid,
                "source": src,
                "target": tgt,
                "type": "animatedEdge",
                "label": label,
                "confidence": confidence,
                "evidence": evidence
            })

        def strip_q(arn):
            """Remove Lambda version/alias qualifier."""
            if not arn:
                return arn
            parts = arn.split(":")
            return ":".join(parts[:7]) if len(parts) > 7 else arn

        def get_metrics(node):
            return node.get("data", {}).get("metrics", {})

        # Group nodes by service for easy lookup
        by_service = {}
        for arn, node in arn_to_node.items():
            svc = node.get("data", {}).get("service", "")
            by_service.setdefault(svc, []).append((arn, node))

        # ── Step 5b: Infer missing nodes from metadata references ─────────────
        # If a Lambda ESM / APIGateway integration / EventBridge target references
        # a node that is NOT yet in the DB, we synthesise a minimal "virtual" node.
        # This allows edges to be rendered immediately without requiring a full re-scan.
        # Virtual nodes carry "inferred": True so the frontend can style them differently.
        already_inferred: set = set()

        def _infer_node(arn: str, svc: str, node_type: str, name: str, region: str, extra_metrics: dict = {}):
            """Add a virtual node if the ARN is not already known."""
            if not arn or arn in arn_to_node or arn in already_inferred:
                return
            already_inferred.add(arn)
            virtual = {
                "id": arn,
                "type": node_type,
                "position": {"x": 0, "y": 0},
                "data": {
                    "name": name,
                    "service": svc,
                    "region": region,
                    "account_id": account.account_id,
                    "resource_arn": arn,
                    "insights": f"Inferred — not yet scanned",
                    "metrics": {"region": region, "inferred": True, **extra_metrics},
                    "tags": {}
                },
                "inferred": True     # frontend hint: render with dashed border / lighter style
            }
            nodes.append(virtual)
            arn_to_node[arn] = virtual
            by_service.setdefault(svc, []).append((arn, virtual))
            logger.info(f"[Inferred] virtual {svc} node: {name} ({arn})")

        def _parse_region(arn: str) -> str:
            parts = arn.split(":")
            return parts[3] if len(parts) > 3 else "unknown"

        # 1. SQS / Kinesis queues referenced in Lambda ESMs
        for lam_arn, lam_node in list(by_service.get("lambda", [])):
            for esm in get_metrics(lam_node).get("eventSourceMappings", []):
                src = (esm.get("eventSourceArn") or esm.get("EventSourceArn", "")).strip()
                if not src:
                    continue
                if ":sqs:" in src:
                    _infer_node(src, "sqs", "sqsNode", src.split(":")[-1], _parse_region(src),
                                {"type": "Standard"})
                elif ":kinesis:" in src:
                    _infer_node(src, "kinesis", "kinesisNode", src.split("/")[-1], _parse_region(src))

        # 2. Lambda functions referenced in APIGateway integrations
        for apigw_arn, apigw_node in list(by_service.get("apigateway", [])):
            for uri in get_metrics(apigw_node).get("integrations", []):
                if not isinstance(uri, str) or "/functions/" not in uri:
                    continue
                func_arn = strip_q(uri.split("/functions/")[1].split("/invocations")[0])
                if func_arn:
                    _infer_node(func_arn, "lambda", "lambdaNode", func_arn.split(":")[-1],
                                _parse_region(func_arn), {"runtime": "unknown"})

        # 3. Lambda / SQS targets referenced in EventBridge rules
        for eb_arn, eb_node in list(by_service.get("eventbridge", [])):
            for tgt in get_metrics(eb_node).get("targets", []):
                tgt_arn = strip_q((tgt.get("Arn") or tgt.get("arn", "")).strip())
                if not tgt_arn:
                    continue
                if ":lambda:" in tgt_arn:
                    _infer_node(tgt_arn, "lambda", "lambdaNode", tgt_arn.split(":")[-1],
                                _parse_region(tgt_arn), {"runtime": "unknown"})
                elif ":sqs:" in tgt_arn:
                    _infer_node(tgt_arn, "sqs", "sqsNode", tgt_arn.split(":")[-1],
                                _parse_region(tgt_arn), {"type": "Standard"})

        # 4. Lambda functions referenced in S3 bucket notification configs
        for s3_arn, s3_node in list(by_service.get("s3", [])):
            notif = get_metrics(s3_node).get("notificationConfiguration", {})
            for cfg in notif.get("LambdaFunctionConfigurations", []):
                func_arn = strip_q(cfg.get("LambdaFunctionArn", ""))
                if func_arn:
                    _infer_node(func_arn, "lambda", "lambdaNode", func_arn.split(":")[-1],
                                _parse_region(func_arn), {"runtime": "unknown"})

        # ── [100] SQS → Lambda via Event Source Mapping ──────────────────────
        for lam_arn, lam_node in by_service.get("lambda", []):
            for esm in get_metrics(lam_node).get("eventSourceMappings", []):
                src_arn = esm.get("eventSourceArn") or esm.get("EventSourceArn", "")
                if src_arn:
                    make_edge(src_arn, lam_arn, "triggers", 100, ["event_source_mapping"])

        # ── [100] S3 → Lambda via bucket notification config ─────────────────
        for s3_arn, s3_node in by_service.get("s3", []):
            notif = get_metrics(s3_node).get("notificationConfiguration", {})
            for cfg in notif.get("LambdaFunctionConfigurations", []):
                func_arn = strip_q(cfg.get("LambdaFunctionArn", ""))
                if func_arn:
                    make_edge(s3_arn, func_arn, "triggers", 100, ["s3_bucket_notification"])

        # ── [100] APIGateway → Lambda via integration URI ─────────────────────
        for apigw_arn, apigw_node in by_service.get("apigateway", []):
            for uri in get_metrics(apigw_node).get("integrations", []):
                if isinstance(uri, str) and "/functions/" in uri and "/invocations" in uri:
                    raw = uri.split("/functions/")[1].split("/invocations")[0]
                    func_arn = strip_q(raw)
                    if func_arn:
                        make_edge(apigw_arn, func_arn, "invokes", 100, ["api_gateway_integration"])

        # ── [100] EventBridge → Lambda / SQS via rule targets ────────────────
        for eb_arn, eb_node in by_service.get("eventbridge", []):
            for tgt in get_metrics(eb_node).get("targets", []):
                tgt_arn = strip_q(tgt.get("Arn") or tgt.get("arn", ""))
                if tgt_arn:
                    make_edge(eb_arn, tgt_arn, "triggers", 100, ["eventbridge_rule_target"])

        # ── [70] EC2 → RDS via Security Group overlap ─────────────────────────
        # Build sg_id → ingress rules from VPC node metrics
        sg_ingress = {}
        for vpc_arn, vpc_node in by_service.get("vpc", []):
            for sg in get_metrics(vpc_node).get("securityGroups", []):
                sg_id = sg.get("groupId")
                if not sg_id:
                    continue
                rules = []
                for perm in sg.get("ipPermissions", []):
                    for pair in perm.get("userIdGroupPairs", []):
                        src_sg = pair.get("groupId")
                        if src_sg:
                            rules.append({"sourceGroup": src_sg,
                                          "fromPort": perm.get("fromPort"),
                                          "toPort": perm.get("toPort")})
                sg_ingress[sg_id] = rules

        for ec2_arn, ec2_node in by_service.get("ec2", []):
            ec2_sgs = set(get_metrics(ec2_node).get("securityGroupIds", []))
            if not ec2_sgs:
                continue
            for rds_arn, rds_node in by_service.get("rds", []):
                rds_vpc_sgs = rds_node.get("data", {}).get("VpcSecurityGroups", [])
                rds_sg_ids = [sg.get("VpcSecurityGroupId") for sg in rds_vpc_sgs if sg.get("VpcSecurityGroupId")]
                for rds_sg in rds_sg_ids:
                    if any(r.get("sourceGroup") in ec2_sgs for r in sg_ingress.get(rds_sg, [])):
                        make_edge(ec2_arn, rds_arn, "writes_to", 70, ["security_group_rule"])
                        break

        # ── Merge DB relationships (if any exist from previous scans) ─────────
        relationships = db.query(Relationship).filter(
            Relationship.snapshot_id == latest_snapshot.id
        ).all()
        for rel in relationships:
            try:
                make_edge(
                    rel.source_arn, rel.target_arn,
                    rel.label or "", rel.confidence or 80,
                    rel.evidence or ["db_relationship"],
                    edge_id=rel.edge_id
                )
            except Exception as e:
                logger.error(f"Failed to merge DB edge: {str(e)}")
                continue

        nodes = normalize_topology_nodes(nodes)
        logger.info(f"Returning {len(nodes)} nodes and {len(edges)} edges (dynamic + db)")

        # ── Step 6: Persist raw normalized output to DB ───────────────────────
        _save_normalized_output(db, latest_snapshot.id, nodes, edges)

        # ── Step 7: Enrich nodes with Metrics + Cost ──────────────────────────
        # Inject telemetryData + metricsSummary + cost directly into node.data
        # so frontend gets ONE complete response with everything.
        total_monthly_cost = 0.0
        cost_summary: dict = {}
        cloudwatch_mode = "skipped"

        if request.include_metrics or request.include_cost:
            # Get AWS credentials for CloudWatch calls
            cw_credentials = None
            try:
                cw_credentials = aws_service._get_temp_credentials(account.role_arn)
                cloudwatch_mode = "live" if cw_credentials else "unavailable"
            except Exception as cred_err:
                logger.warning(f"[Normalize] Credentials unavailable: {cred_err}")
                cloudwatch_mode = "unavailable"

            # Group nodes by region for efficient CW client reuse
            region_groups: dict = {}
            for node in nodes:
                rgn = node["data"].get("region", "ap-south-1")
                region_groups.setdefault(rgn, []).append(node)

            # ── Run MetricsEngine per region ──────────────────────────────────
            metrics_results: dict = {}
            if request.include_metrics and cw_credentials:
                for rgn, rgn_nodes in region_groups.items():
                    try:
                        rgn_metrics = metrics_engine.collect_all(
                            rgn_nodes, cw_credentials, rgn, period_hours=24
                        )
                        metrics_results.update(rgn_metrics)
                    except Exception as me:
                        logger.error(f"[Normalize] MetricsEngine error for {rgn}: {me}")
            else:
                # Fill empty so CostEngine still runs from static metrics in node.data
                for node in nodes:
                    arn = node["id"]
                    metrics_results[arn] = {
                        "service": node["data"].get("service", ""),
                        "cloudwatch": {}, "telemetryData": [],
                        "summary": {}, "schema": [],
                        "errors": ["CloudWatch skipped" if not request.include_metrics else "No credentials"]
                    }

            # ── Run CostEngine ────────────────────────────────────────────────
            primary_region = list(region_groups.keys())[0] if region_groups else "ap-south-1"
            cost_results: dict = {}
            if request.include_cost:
                try:
                    cost_results = cost_engine.calculate_all(
                        nodes, metrics_results, region=primary_region
                    )
                except Exception as ce:
                    logger.error(f"[Normalize] CostEngine error: {ce}")

            # ── Inject into each node.data ────────────────────────────────────
            for node in nodes:
                arn = node["id"]
                m   = metrics_results.get(arn, {})
                c   = cost_results.get(arn, {})

                # Inject telemetry + metrics summary
                node["data"]["telemetryData"]    = m.get("telemetryData", [])
                node["data"]["metricsSummary"]   = m.get("summary", {})
                node["data"]["telemetrySchema"]  = m.get("schema", [])

                # Inject cost
                node["data"]["cost"] = {
                    "source":           c.get("source", "pricing-api"),
                    "confidence":       c.get("confidence", "estimated"),
                    "billingModel":     c.get("billingModel", "unknown"),
                    "dailyCost":        c.get("dailyCost", 0.0),
                    "monthlyCost":      c.get("monthlyCost", 0.0),
                    "yearlyCost":       c.get("yearlyCost", 0.0),
                    "currency":         c.get("currency", "USD"),
                    "usageMetrics":     c.get("usageMetrics", {}),
                    "lineItems":        c.get("lineItems", []),
                    "notes":            c.get("notes", ""),
                }

            # ── Build cost summary ────────────────────────────────────────────
            total_monthly_cost = cost_engine.total_cost(cost_results)
            for arn, cr in cost_results.items():
                svc = cr.get("service", "unknown")
                cost_summary[svc] = round(
                    cost_summary.get(svc, 0.0) + cr.get("monthlyCost", 0.0), 4
                )

            logger.info(
                f"[Normalize] Enrichment complete. "
                f"CW mode: {cloudwatch_mode}. "
                f"Estimated total: ${total_monthly_cost}/month"
            )

        return NormalizeAccountResponse(
            success=True,
            message=f"Successfully normalized snapshot v{latest_snapshot.version_number}",
            account_name=account.account_name,
            snapshot_version=latest_snapshot.version_number,
            total_resources=len(nodes),
            nodes=nodes,
            edges=edges,
            total_monthly_cost=total_monthly_cost,
            cost_summary=cost_summary,
            cloudwatch_mode=cloudwatch_mode,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Account normalization error: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"Normalization error: {str(e)}"
        )


# ─────────────────────────────────────────
# SAVE NORMALIZED OUTPUT TO DB
# ─────────────────────────────────────────

def _save_normalized_output(
    db: Session,
    snapshot_id,
    nodes: list,
    edges: list
) -> None:
    """
    Persist the final computed React Flow nodes and edges
    into normalized_nodes and normalized_edges tables.

    This is idempotent — existing rows for this snapshot
    are deleted before re-inserting, so re-normalizing
    the same snapshot is always safe.
    """
    try:
        # Delete existing normalized data for this snapshot (idempotent)
        db.query(NormalizedNode).filter(
            NormalizedNode.snapshot_id == snapshot_id
        ).delete(synchronize_session=False)

        db.query(NormalizedEdge).filter(
            NormalizedEdge.snapshot_id == snapshot_id
        ).delete(synchronize_session=False)

        # Insert all nodes
        for node in nodes:
            data = node.get("data", {})
            db.add(NormalizedNode(
                snapshot_id=snapshot_id,
                node_id=node["id"],
                node_type=node["type"],
                resource_arn=data.get("resource_arn", node["id"]),
                resource_name=data.get("name", ""),
                service=data.get("service", ""),
                region=data.get("region", ""),
                account_id=data.get("account_id", ""),
                parent_node_id=node.get("parentID") or node.get("parentId"),
                insights=data.get("insights", ""),
                metrics=data.get("metrics", {}),
                tags=data.get("tags", {}),
                is_inferred=node.get("inferred", False),
                position_x=node.get("position", {}).get("x", 0),
                position_y=node.get("position", {}).get("y", 0),
            ))

        # Insert all edges
        for edge in edges:
            db.add(NormalizedEdge(
                snapshot_id=snapshot_id,
                edge_id=edge["id"],
                source_arn=edge["source"],
                target_arn=edge["target"],
                edge_type=edge.get("type", "animatedEdge"),
                label=edge.get("label", ""),
                confidence=edge.get("confidence"),
                evidence=edge.get("evidence"),
            ))

        db.commit()
        logger.info(
            f"✓ Saved {len(nodes)} normalized nodes and "
            f"{len(edges)} normalized edges for snapshot {snapshot_id}"
        )

    except Exception as e:
        logger.error(f"Failed to save normalized output: {str(e)}")
        db.rollback()
        # Don't raise — normalization response is still returned to the frontend


# ─────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────

@router.get("/health")
def normalize_health():
    """Check if normalization service is ready"""
    return {
        "status": "ready",
        "message": "Normalization service fetches latest snapshots and normalizes data from database"
    }
