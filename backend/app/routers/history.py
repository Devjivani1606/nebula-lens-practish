from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_
from uuid import UUID as UUIDClass
from app.database import get_db
from app.models.models import AwsAccount, Snapshot, NormalizedNode, NormalizedEdge, SnapshotDiff, ChangeType
from app.engines.cost_engine import cost_engine
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/history", tags=["History"])


# Helper to convert NormalizedNode to the dict format expected by cost_engine and React Flow
def row_to_node_dict(row: NormalizedNode) -> Dict[str, Any]:
    return {
        "id": row.node_id,
        "type": row.node_type,
        "parentId": row.parent_node_id,
        "position": {"x": row.position_x, "y": row.position_y},
        "data": {
            "name": row.resource_name,
            "service": row.service,
            "region": row.region,
            "account_id": row.account_id,
            "resource_arn": row.resource_arn,
            "insights": row.insights,
            "metrics": row.metrics or {},
            "tags": row.tags or {}
        }
    }


@router.get("")
def get_snapshot_history(account_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Returns lists of all snapshots for a given account with total resource counts,
    cost calculations, and change stats.
    """
    try:
        # Find AWS Account first
        account = None
        if account_id:
            parsed_uuid = None
            try:
                parsed_uuid = UUIDClass(account_id)
            except ValueError:
                pass

            query = db.query(AwsAccount)
            if parsed_uuid:
                account = query.filter(
                    or_(
                        AwsAccount.id == parsed_uuid,
                        AwsAccount.account_id == account_id
                    )
                ).first()
            else:
                account = query.filter(AwsAccount.account_id == account_id).first()
        else:
            # Fallback to the first account if none specified
            account = db.query(AwsAccount).first()

        if not account:
            return {"versions": [], "total_versions": 0}

        snapshots = db.query(Snapshot).filter(
            Snapshot.account_id == account.id
        ).order_by(Snapshot.version_number.desc()).all()

        versions_data = []
        for snap in snapshots:
            # Fetch nodes to calculate cost and resource count
            nodes_rows = db.query(NormalizedNode).filter(NormalizedNode.snapshot_id == snap.id).all()
            nodes_dicts = [row_to_node_dict(n) for n in nodes_rows]
            
            # Run offline cost calculation using fallback prices
            cost_results = cost_engine.calculate_all(nodes_dicts, {})
            total_monthly_cost = cost_engine.total_cost(cost_results)

            # Summarize cost by service
            cost_summary = {}
            for cr in cost_results.values():
                svc = cr.get("service", "unknown")
                cost_summary[svc] = round(cost_summary.get(svc, 0.0) + cr.get("monthlyCost", 0.0), 2)

            # Count changes compared to the previous snapshot
            added_count = db.query(SnapshotDiff).filter(
                SnapshotDiff.to_snapshot == snap.id,
                SnapshotDiff.change_type == ChangeType.added
            ).count()
            
            removed_count = db.query(SnapshotDiff).filter(
                SnapshotDiff.to_snapshot == snap.id,
                SnapshotDiff.change_type == ChangeType.removed
            ).count()

            modified_count = db.query(SnapshotDiff).filter(
                SnapshotDiff.to_snapshot == snap.id,
                SnapshotDiff.change_type == ChangeType.modified
            ).count()

            versions_data.append({
                "version_id": str(snap.id),
                "version_number": snap.version_number,
                "label": snap.label or f"Version {snap.version_number}",
                "is_latest": snap.is_latest,
                "created_at": snap.created_at.isoformat() if snap.created_at else None,
                "summary": {
                    "total_resources": len(nodes_dicts),
                },
                "costs": {
                    "total_monthly": total_monthly_cost,
                    "by_service": cost_summary
                },
                "changes": {
                    "added": added_count,
                    "removed": removed_count,
                    "modified": modified_count
                }
            })

        return {
            "versions": versions_data,
            "total_versions": len(versions_data)
        }

    except Exception as e:
        logger.error(f"Error fetching snapshot history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/snapshot/{snapshot_id}")
def get_snapshot_graph(snapshot_id: str, db: Session = Depends(get_db)):
    """
    Returns the full React Flow nodes and edges for a specific historical snapshot.
    """
    try:
        snap_uuid = UUIDClass(snapshot_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid snapshot UUID format")

    snapshot = db.query(Snapshot).filter(Snapshot.id == snap_uuid).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Fetch nodes
    nodes_rows = db.query(NormalizedNode).filter(NormalizedNode.snapshot_id == snapshot.id).all()
    nodes_dicts = [row_to_node_dict(n) for n in nodes_rows]

    # Fetch edges
    edges_rows = db.query(NormalizedEdge).filter(NormalizedEdge.snapshot_id == snapshot.id).all()
    edges_dicts = []
    for e in edges_rows:
        edges_dicts.append({
            "id": e.edge_id,
            "source": e.source_arn,
            "target": e.target_arn,
            "type": e.edge_type,
            "label": e.label,
            "confidence": e.confidence,
            "evidence": e.evidence
        })

    # Run cost engine to enrich the returned nodes so the Canvas shows the correct cost lens values
    cost_results = cost_engine.calculate_all(nodes_dicts, {})
    for node in nodes_dicts:
        arn = node["id"]
        c = cost_results.get(arn, {})
        node["data"]["cost"] = {
            "source":       c.get("source", "pricing-api"),
            "confidence":   c.get("confidence", "estimated"),
            "billingModel": c.get("billingModel", "unknown"),
            "dailyCost":    c.get("dailyCost", 0.0),
            "monthlyCost":  c.get("monthlyCost", 0.0),
            "yearlyCost":   c.get("yearlyCost", 0.0),
            "currency":     c.get("currency", "USD"),
            "usageMetrics": c.get("usageMetrics", {}),
            "lineItems":    c.get("lineItems", []),
            "notes":        c.get("notes", ""),
        }

    return {
        "nodes": nodes_dicts,
        "edges": edges_dicts
    }


@router.get("/snapshot/{snapshot_id}/diff")
def get_snapshot_diff(snapshot_id: str, db: Session = Depends(get_db)):
    """
    Returns the diff details (added/removed/modified resources) for a snapshot.
    """
    try:
        snap_uuid = UUIDClass(snapshot_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid snapshot UUID format")

    diffs = db.query(SnapshotDiff).filter(
        SnapshotDiff.to_snapshot == snap_uuid
    ).all()

    results = []
    for d in diffs:
        results.append({
            "id": str(d.id),
            "change_type": d.change_type,
            "resource_arn": d.resource_arn,
            "resource_type": d.resource_type,
            "change_details": d.change_details
        })

    return {
        "snapshot_id": snapshot_id,
        "diffs": results
    }
