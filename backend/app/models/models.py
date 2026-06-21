# It contains the schemas for the database.
# Each schema is a class that inherits from Base.

from sqlalchemy import (
    Column, String, Integer, Boolean,
    DateTime, Text, ForeignKey, Enum
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid
import enum

# ─────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────

class ScanStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    success = "success"
    partial = "partial"
    failed  = "failed"

class ChangeType(str, enum.Enum):
    added    = "added"
    removed  = "removed"
    modified = "modified"

# ─────────────────────────────────────────
# TABLE 1 — USERS
# ─────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email      = Column(String(255), unique=True, nullable=False)
    name       = Column(String(255))
    auth0_id   = Column(String(255), unique=True)  # Auth0 user ID this Auth0 later we use them
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    aws_accounts = relationship("AwsAccount", back_populates="user") # this python allowing you to access a user's aws accounts like user.aws_accounts and aws_account.user this twoway mapping

# ─────────────────────────────────────────
# TABLE 2 — AWS ACCOUNTS
# ─────────────────────────────────────────

class AwsAccount(Base):
    __tablename__ = "aws_accounts"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id        = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    account_id     = Column(String(12), nullable=False)   # AWS 12 digit account ID
    account_name   = Column(String(255))
    role_arn       = Column(Text)                          # IAM Role ARN
    external_id    = Column(String(255), nullable=True)    # ExternalId used for cross-account assume role
    status         = Column(String(50), default="active")
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user           = relationship("User", back_populates="aws_accounts")
    scan_jobs      = relationship("ScanJob", back_populates="aws_account")
    snapshots      = relationship("Snapshot", back_populates="aws_account")

# ─────────────────────────────────────────
# TABLE 3 — SCAN JOBS
# ─────────────────────────────────────────

class ScanJob(Base):
    __tablename__ = "scan_jobs" # Represents one execution of a full scan.

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id     = Column(UUID(as_uuid=True), ForeignKey("aws_accounts.id"), nullable=False)
    status         = Column(Enum(ScanStatus), default=ScanStatus.pending)
    triggered_by   = Column(String(50), default="scheduler")  # scheduler / manual
    error_message  = Column(Text)
    started_at     = Column(DateTime(timezone=True))
    completed_at   = Column(DateTime(timezone=True))
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    aws_account    = relationship("AwsAccount", back_populates="scan_jobs")
    service_scans  = relationship("ServiceScan", back_populates="scan_job")

# ─────────────────────────────────────────
# TABLE 4 — SERVICE SCANS
# ─────────────────────────────────────────

class ServiceScan(Base):
    __tablename__ = "service_scans" # Tracks each separate region/service task (e.g., EC2 in us-east-1, S3 in eu-west-1)

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_job_id    = Column(UUID(as_uuid=True), ForeignKey("scan_jobs.id"), nullable=False)
    service        = Column(String(50), nullable=False)   # ec2, s3, rds, lambda etc
    region         = Column(String(50), nullable=False)
    status         = Column(Enum(ScanStatus), default=ScanStatus.pending)
    resources_found = Column(Integer, default=0)
    error_message  = Column(Text)
    started_at     = Column(DateTime(timezone=True))
    completed_at   = Column(DateTime(timezone=True))

    # Relationships
    scan_job       = relationship("ScanJob", back_populates="service_scans")

# ─────────────────────────────────────────
# TABLE 5 — SNAPSHOTS
# ─────────────────────────────────────────

class Snapshot(Base):
    __tablename__ = "snapshots"

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id     = Column(UUID(as_uuid=True), ForeignKey("aws_accounts.id"), nullable=False)
    version_number = Column(Integer, nullable=False)  # Incremented each time a scan is run
    label          = Column(String(255))                  # e.g. "Version 1"
    is_latest      = Column(Boolean, default=False)  # Set to True for the newest version, False for historical versions.
    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    aws_account    = relationship("AwsAccount", back_populates="snapshots")
    resources      = relationship("Resource", back_populates="snapshot")
    relationships  = relationship("Relationship", back_populates="snapshot")
    normalized_nodes  = relationship("NormalizedNode", back_populates="snapshot")
    normalized_edges  = relationship("NormalizedEdge", back_populates="snapshot")

# ─────────────────────────────────────────
# TABLE 6 — RESOURCES
# ─────────────────────────────────────────

class Resource(Base):
    __tablename__ = "resources"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id     = Column(UUID(as_uuid=True), ForeignKey("snapshots.id"), nullable=False)

    # React Flow fields
    node_id         = Column(Text, nullable=False)        # ARN used as node ID
    node_type       = Column(String(50), nullable=False)  # vpcNode, lambdaNode etc
    parent_node_id  = Column(Text)                        # null if top level

    # Backend fields
    resource_arn    = Column(Text, nullable=False)
    resource_name   = Column(String(255))
    service         = Column(String(50), nullable=False)  # vpc, lambda, s3 etc
    region          = Column(String(50), nullable=False)
    account_id      = Column(String(12), nullable=False)
    fingerprint     = Column(String(64), nullable=False)  # SHA256 hash

    # All service specific data
    meta_data       = Column("metadata", JSONB, nullable=False)       # save custom AWS metrics profiles (like memory sizes, storage limits, etc.)

    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snapshot        = relationship("Snapshot", back_populates="resources")

# ─────────────────────────────────────────
# TABLE 7 — RELATIONSHIPS (EDGES)
# ─────────────────────────────────────────

class Relationship(Base):
    __tablename__ = "relationships"  # Maps standard React Flow edges showing how nodes link together (e.g. VPC hosts Subnet).

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id    = Column(UUID(as_uuid=True), ForeignKey("snapshots.id"), nullable=False)

    # React Flow edge fields
    edge_id        = Column(Text, nullable=False)
    source_arn     = Column(Text, nullable=False)
    target_arn     = Column(Text, nullable=False)
    edge_type      = Column(String(50), default="animatedEdge")
    label          = Column(String(100))
    confidence     = Column(Integer, nullable=True)
    evidence       = Column(JSONB, nullable=True)

    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snapshot       = relationship("Snapshot", back_populates="relationships")

# ─────────────────────────────────────────
# TABLE 8 — SNAPSHOT DIFFS
# ─────────────────────────────────────────

class SnapshotDiff(Base):
    __tablename__ = "snapshot_diffs"  # Stores the exact differences between snapshots

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_snapshot   = Column(UUID(as_uuid=True), ForeignKey("snapshots.id"), nullable=False)
    to_snapshot     = Column(UUID(as_uuid=True), ForeignKey("snapshots.id"), nullable=False)
    change_type     = Column(Enum(ChangeType), nullable=False)  # added/removed/modified
    resource_arn    = Column(Text, nullable=False)
    resource_type   = Column(String(50))
    change_details  = Column(JSONB)                             # what exactly changed
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

# ─────────────────────────────────────────
# TABLE 9 — NORMALIZED NODES
# ─────────────────────────────────────────

class NormalizedNode(Base):
    __tablename__ = "normalized_nodes"  # Stores the final computed React Flow nodes for each snapshot

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id    = Column(UUID(as_uuid=True), ForeignKey("snapshots.id"), nullable=False)

    # React Flow identity
    node_id        = Column(Text, nullable=False)        # ARN used as React Flow node id
    node_type      = Column(String(50), nullable=False)  # ec2Node, lambdaNode, vpcNode etc

    # AWS identity
    resource_arn   = Column(Text, nullable=False)
    resource_name  = Column(String(255))
    service        = Column(String(50), nullable=False)  # ec2, lambda, s3, vpc, subnet etc
    region         = Column(String(50), nullable=False)
    account_id     = Column(String(12), nullable=False)

    # Hierarchy
    parent_node_id = Column(Text, nullable=True)         # parent ARN for VPC/Subnet nesting

    # Display data
    insights       = Column(Text)                        # e.g. "Running - t3.micro"
    metrics        = Column(JSONB)                       # service-specific metrics
    tags           = Column(JSONB)                       # AWS resource tags

    # Flags
    is_inferred    = Column(Boolean, default=False)      # True for virtual/inferred nodes

    # React Flow layout positions (0,0 by default; frontend handles layout)
    position_x     = Column(Integer, default=0)
    position_y     = Column(Integer, default=0)

    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snapshot       = relationship("Snapshot", back_populates="normalized_nodes")

# ─────────────────────────────────────────
# TABLE 10 — NORMALIZED EDGES
# ─────────────────────────────────────────

class NormalizedEdge(Base):
    __tablename__ = "normalized_edges"  # Stores the final computed React Flow edges for each snapshot

    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_id    = Column(UUID(as_uuid=True), ForeignKey("snapshots.id"), nullable=False)

    # React Flow edge fields
    edge_id        = Column(Text, nullable=False)
    source_arn     = Column(Text, nullable=False)
    target_arn     = Column(Text, nullable=False)
    edge_type      = Column(String(50), default="animatedEdge")
    label          = Column(String(100))                 # triggers, writes_to, invokes etc
    confidence     = Column(Integer, nullable=True)      # 0–100
    evidence       = Column(JSONB, nullable=True)        # list of evidence type strings

    created_at     = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    snapshot       = relationship("Snapshot", back_populates="normalized_edges")