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

@router.get("/resources")
def get_db_resources(snapshot_id: str = None, db: Session = Depends(get_db)):
    """Fetch rows from resources table."""
    try:
        query = db.query(Resource)
        if snapshot_id:
            query = query.filter(Resource.snapshot_id == snapshot_id)
        resources = query.all()
        return [
            {
                "id": str(r.id),
                "snapshot_id": str(r.snapshot_id),
                "node_id": r.node_id,
                "node_type": r.node_type,
                "resource_name": r.resource_name,
                "service": r.service,
                "region": r.region,
                "parent_node_id": r.parent_node_id
            }
            for r in resources
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/relationships")
def get_db_relationships(snapshot_id: str = None, db: Session = Depends(get_db)):
    """Fetch rows from relationships table."""
    try:
        query = db.query(Relationship)
        if snapshot_id:
            query = query.filter(Relationship.snapshot_id == snapshot_id)
        rels = query.all()
        return [
            {
                "id": str(r.id),
                "snapshot_id": str(r.snapshot_id),
                "edge_id": r.edge_id,
                "source_arn": r.source_arn,
                "target_arn": r.target_arn,
                "label": r.label,
                "confidence": r.confidence
            }
            for r in rels
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs")
def get_db_jobs(db: Session = Depends(get_db)):
    """Fetch all rows from scan_jobs table."""
    try:
        jobs = db.query(ScanJob).order_by(ScanJob.created_at.desc()).all()
        return [
            {
                "id": str(j.id),
                "account_id": str(j.account_id),
                "status": j.status,
                "triggered_by": j.triggered_by,
                "error_message": j.error_message,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None
            }
            for j in jobs
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/delete/{table}/{row_id}")
def delete_db_row(table: str, row_id: str, db: Session = Depends(get_db)):
    """Delete a row from a database table by ID."""
    try:
        if table == "accounts":
            model = AwsAccount
        elif table == "snapshots":
            model = Snapshot
        elif table == "nodes":
            model = NormalizedNode
        elif table == "edges":
            model = NormalizedEdge
        elif table == "resources":
            model = Resource
        elif table == "relationships":
            model = Relationship
        elif table == "jobs":
            model = ScanJob
        else:
            raise HTTPException(status_code=400, detail="Invalid table name")

        from uuid import UUID
        try:
            parsed_id = UUID(row_id)
        except ValueError:
            parsed_id = row_id

        row = db.query(model).filter(model.id == parsed_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Row not found")

        db.delete(row)
        db.commit()
        return {"success": True, "message": f"Successfully deleted row from {table}"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
