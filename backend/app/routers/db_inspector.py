from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import AwsAccount, Snapshot, NormalizedNode, NormalizedEdge, Resource, Relationship, ScanJob
from typing import Dict, Any, List

router = APIRouter(prefix="/api/db", tags=["Database Inspector"])

@router.get("/stats")
def get_db_stats(db: Session = Depends(get_db)):
    """Get record counts for all tables in the database."""
    try:
        return {
            "aws_accounts": db.query(AwsAccount).count(),
            "snapshots": db.query(Snapshot).count(),
            "resources_raw": db.query(Resource).count(),
            "relationships_raw": db.query(Relationship).count(),
            "normalized_nodes": db.query(NormalizedNode).count(),
            "normalized_edges": db.query(NormalizedEdge).count(),
            "scan_jobs": db.query(ScanJob).count()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/accounts")
def get_db_accounts(db: Session = Depends(get_db)):
    """Fetch all rows from aws_accounts table."""
    try:
        accounts = db.query(AwsAccount).all()
        return [
            {
                "id": str(a.id),
                "account_id": a.account_id,
                "account_name": a.account_name,
                "role_arn": a.role_arn,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None
            }
            for a in accounts
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/snapshots")
def get_db_snapshots(db: Session = Depends(get_db)):
    """Fetch all rows from snapshots table."""
    try:
        snapshots = db.query(Snapshot).order_by(Snapshot.created_at.desc()).all()
        return [
            {
                "id": str(s.id),
                "account_id": str(s.account_id),
                "version_number": s.version_number,
                "label": s.label,
                "is_latest": s.is_latest,
                "created_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in snapshots
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/nodes")
def get_db_nodes(snapshot_id: str = None, db: Session = Depends(get_db)):
    """Fetch rows from normalized_nodes table."""
    try:
        query = db.query(NormalizedNode)
        if snapshot_id:
            query = query.filter(NormalizedNode.snapshot_id == snapshot_id)
        nodes = query.all()
        return [
            {
                "id": str(n.id),
                "snapshot_id": str(n.snapshot_id),
                "node_id": n.node_id,
                "node_type": n.node_type,
                "resource_name": n.resource_name,
                "service": n.service,
                "region": n.region,
                "parent_node_id": n.parent_node_id,
                "is_inferred": n.is_inferred
            }
            for n in nodes
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/edges")
def get_db_edges(snapshot_id: str = None, db: Session = Depends(get_db)):
    """Fetch rows from normalized_edges table."""
    try:
        query = db.query(NormalizedEdge)
        if snapshot_id:
            query = query.filter(NormalizedEdge.snapshot_id == snapshot_id)
        edges = query.all()
        return [
            {
                "id": str(e.id),
                "snapshot_id": str(e.snapshot_id),
                "edge_id": e.edge_id,
                "source_arn": e.source_arn,
                "target_arn": e.target_arn,
                "label": e.label,
                "confidence": e.confidence
            }
            for e in edges
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
