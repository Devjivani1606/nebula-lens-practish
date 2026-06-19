import logging
from sqlalchemy.orm import Session
from app.models.models import (
    Snapshot, Resource, Relationship,
    SnapshotDiff, ChangeType, AwsAccount
)
from uuid import UUID

logger = logging.getLogger(__name__)


class SnapshotEngine:

    def create_snapshot(
        self,
        db: Session,
        account_db_id: UUID,
        all_nodes: list,
        all_edges: list,
        aws_account_id: str
    ) -> Snapshot:
        """
        Save all scanned resources as an immutable snapshot.
        Creates Version 1, Version 2 etc automatically.
        """

        # Get next version number
        last_snapshot = db.query(Snapshot).filter(
            Snapshot.account_id == account_db_id
        ).order_by(Snapshot.version_number.desc()).first()

        version_number = 1 if not last_snapshot else last_snapshot.version_number + 1

        # Mark old snapshots as not latest
        db.query(Snapshot).filter(
            Snapshot.account_id == account_db_id,
            Snapshot.is_latest == True
        ).update({"is_latest": False})

        # Create new snapshot
        snapshot = Snapshot(
            account_id=account_db_id,
            version_number=version_number,
            label=f"Version {version_number}",
            is_latest=True
        )
        db.add(snapshot)
        db.flush()  # Get snapshot.id without full commit

        # Save all nodes as resources
        for node_result in all_nodes:
            node = node_result['node']
            resource = Resource(
                snapshot_id=snapshot.id,
                node_id=node['id'],
                node_type=node['type'],
                parent_node_id=node.get('parentID'),
                resource_arn=node_result['resource_arn'],
                resource_name=node_result.get('resource_name', ''),
                service=node['data']['service'],
                region=node['data']['region'],
                account_id=aws_account_id,
                fingerprint=node_result['fingerprint'],
                meta_data=node['data']
)
            db.add(resource)

        # Save all edges as relationships
        for edge in all_edges:
            relationship = Relationship(
                snapshot_id=snapshot.id,
                edge_id=edge['id'],
                source_arn=edge['source'],
                target_arn=edge['target'],
                edge_type=edge['type'],
                label=edge.get('label', ''),
                confidence=edge.get('confidence'),
                evidence=edge.get('evidence')
            )
            db.add(relationship)

        db.commit()
        db.refresh(snapshot)

        logger.info(
            f"Snapshot Version {version_number} created "
            f"with {len(all_nodes)} resources and {len(all_edges)} edges"
        )
        return snapshot


snapshot_engine = SnapshotEngine()