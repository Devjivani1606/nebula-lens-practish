from fastapi import APIRouter
from typing import Optional
from sqlalchemy import or_
from uuid import UUID as UUIDClass
from app.database import SessionLocal
from app.models.models import Snapshot, Resource, Relationship, AwsAccount
from app.utils.topology import normalize_topology_nodes

router = APIRouter(prefix="/api/graph", tags=["Graph"])


@router.get("/latest")
def get_latest_graph(account_id: Optional[str] = None, only_new: bool = False):
    """
    Returns the latest snapshot graph with:
    - Nodes: only the 7 supported services (vpc, subnet, ec2, lambda, rds, sqs, s3, apigateway)
    - Edges: only REAL communication flows (invokes, triggers, writes_to, etc.)
    
    VPC and Subnet appear as nodes for hierarchy (parentId nesting) 
    but are NEVER used as edge source or target.
    """
    db = SessionLocal()
    try:
        if account_id:
            parsed_uuid = None
            try:
                parsed_uuid = UUIDClass(account_id)
            except ValueError:
                parsed_uuid = None

            query = db.query(AwsAccount)
            if parsed_uuid:
                account = query.filter(
                    or_(
                        AwsAccount.id == parsed_uuid,
                        AwsAccount.account_id == account_id,
                    )
                ).first()
            else:
                account = query.filter(AwsAccount.account_id == account_id).first()

            if not account:
                return {"nodes": [], "edges": []}

            snapshot = db.query(Snapshot).filter(
                Snapshot.account_id == account.id,
                Snapshot.is_latest == True
            ).order_by(Snapshot.created_at.desc()).first()
        else:
            snapshot = db.query(Snapshot).filter(
                Snapshot.is_latest == True
            ).order_by(Snapshot.created_at.desc()).first()

        if not snapshot:
            return {"nodes": [], "edges": []}

        # Only the supported services — filters out old/mock data
        SUPPORTED_SERVICES = {"vpc", "subnet", "ec2", "lambda", "rds", "sqs", "s3", "apigateway", "eventbridge"}

        resources = db.query(Resource).filter(
            Resource.snapshot_id == snapshot.id,
            Resource.service.in_(SUPPORTED_SERVICES)
        ).all()

        if only_new:
            # Find the previous snapshot for the same account
            previous_snapshot = db.query(Snapshot).filter(
                Snapshot.account_id == snapshot.account_id,
                Snapshot.version_number < snapshot.version_number
            ).order_by(Snapshot.version_number.desc()).first()

            if previous_snapshot:
                # Find all node IDs from the previous snapshot
                previous_resources = db.query(Resource).filter(
                    Resource.snapshot_id == previous_snapshot.id
                ).all()
                previous_node_ids = {r.node_id for r in previous_resources}
                
                # Filter resources to only those that were NOT present in the previous snapshot
                resources = [r for r in resources if r.node_id not in previous_node_ids]

        relationships = db.query(Relationship).filter(
            Relationship.snapshot_id == snapshot.id
        ).all()

        # Build lookup sets from the (possibly filtered) resources list
        resource_node_ids = {r.node_id for r in resources}
        resource_arns = {r.resource_arn for r in resources}

        # VPC and Subnet are hierarchy containers, not communication endpoints
        vpc_subnet_arns = {r.resource_arn for r in resources if r.service in ("vpc", "subnet")}


        # Build nodes
        nodes = []
        for r in resources:
            meta = r.meta_data or {}

            # React Flow uses parentId for nesting. Strip it if parent is not in returned resources list.
            parent_id = r.parent_node_id
            if parent_id and parent_id not in resource_node_ids:
                parent_id = None

            node = {
                "id": r.node_id,
                "type": r.node_type,
                "parentId": parent_id,   # React Flow uses parentId for nesting
                "position": {"x": 0, "y": 0},
                "data": {
                    "name": r.resource_name,
                    "insights": meta.get("insights"),
                    "metrics": meta.get("metrics", {}),
                    "service": r.service,
                    "region": r.region,
                    "accountId": r.account_id,
                    "arn": r.resource_arn,
                    "tags": meta.get("tags", {})
                }
            }
            nodes.append(node)

        nodes = normalize_topology_nodes(nodes)

        # Build edges — exclude VPC/Subnet endpoints entirely
        edges = []
        for rel in relationships:
            # Both endpoints must be supported resources
            if rel.source_arn not in resource_arns or rel.target_arn not in resource_arns:
                continue

            # VPC/Subnet containment is represented by parentId, NOT by edges
            if rel.source_arn in vpc_subnet_arns or rel.target_arn in vpc_subnet_arns:
                continue

            edges.append({
                "id": rel.edge_id,
                "source": rel.source_arn,
                "target": rel.target_arn,
                "type": rel.edge_type,
                "label": rel.label,
                "confidence": rel.confidence,
                "evidence": rel.evidence
            })

        return {
            "nodes": nodes,
            "edges": edges
        }

    finally:
        db.close()