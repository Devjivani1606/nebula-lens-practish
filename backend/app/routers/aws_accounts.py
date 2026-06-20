# This file is REST Api endpoints

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import (
    AwsAccount, User, ScanJob, ScanStatus, Snapshot,
    Resource, Relationship, NormalizedNode, NormalizedEdge,
    ServiceScan, SnapshotDiff
)
from app.schemas.aws_account import (
    ConnectAwsRequest,
    ConnectAwsResponse,
    AwsAccountResponse
)
from app.services.aws_service import aws_service
import logging
from uuid import UUID as UUIDClass

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/aws", tags=["AWS Accounts"]) # Here tags means all the api endpoints in this file should be displayed under the tag name AWS Accounts in swagger ui


@router.post("/connect", response_model=ConnectAwsResponse)
def connect_aws_account(
    request: ConnectAwsRequest,
    db: Session = Depends(get_db)
):
    """
    Connect a new AWS account using IAM Role ARN.
    
    Flow:
    1. Verify Role ARN using STS
    2. Check if account already connected
    3. Save to database
    4. Create first scan job
    """

    # Step 1: Verify the Role ARN with AWS STS
    logger.info(f"Verifying Role ARN: {request.role_arn}")
    verification = aws_service.verify_role_arn(request.role_arn)

    if not verification['success']:
        raise HTTPException(
            status_code=400,
            detail=verification['error']
        )

    aws_account_id = verification['account_id']

    # Step 2: Check if this AWS account is already connected
    existing = db.query(AwsAccount).filter(
        AwsAccount.account_id == aws_account_id
    ).first()

    if existing:
        return ConnectAwsResponse(
            success=False,
            message=f"AWS Account {aws_account_id} is already connected.",
            account=None
        )

    # Step 3: For MVP — create a default user or use existing
    # (Later this will use Auth0 user ID from JWT token)
    user = db.query(User).first()
    if not user:
        user = User(email="default@gravitylens.com", name="Default User")
        db.add(user)
        db.commit()
        db.refresh(user)

    # Step 4: Save AWS Account to database
    new_account = AwsAccount(
        user_id=user.id,
        account_id=aws_account_id,
        account_name=request.account_name or f"AWS Account {aws_account_id}",
        role_arn=request.role_arn,
        status="active"
    )
    db.add(new_account)
    db.commit()
    db.refresh(new_account)

    # Step 5: Create first scan job immediately
    scan_job = ScanJob(
        account_id=new_account.id,
        status=ScanStatus.pending,
        triggered_by="initial_connect"
    )
    db.add(scan_job)
    db.commit()

    logger.info(f"AWS Account {aws_account_id} connected successfully")

    return ConnectAwsResponse(
        success=True,
        message=f"AWS Account {aws_account_id} connected successfully. First scan queued.",
        account=AwsAccountResponse(
            id=new_account.id,
            account_id=new_account.account_id,
            account_name=new_account.account_name,
            role_arn=new_account.role_arn,
            status=new_account.status,
            created_at=new_account.created_at
        )
    )


@router.get("/accounts", response_model=list[AwsAccountResponse])
def get_all_accounts(db: Session = Depends(get_db)):
    """Get all connected AWS accounts."""
    accounts = db.query(AwsAccount).all()
    return accounts


@router.get("/accounts/{account_id}/status")
def get_account_status(account_id: str, db: Session = Depends(get_db)):
    """Get status of a connected AWS account."""
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
        raise HTTPException(status_code=404, detail="Account not found")

    # Get latest scan job
    latest_scan = db.query(ScanJob).filter(
        ScanJob.account_id == account.id
    ).order_by(ScanJob.created_at.desc()).first()

    return {
        "account_id": account.account_id,
        "account_name": account.account_name,
        "status": account.status,
        "latest_scan_status": latest_scan.status if latest_scan else None,
        "latest_scan_at": latest_scan.created_at if latest_scan else None
    }


@router.post("/reset")
def reset_database(db: Session = Depends(get_db)):
    """Erase all scans, snapshots, resources, edges, and connected AWS accounts from the database."""
    try:
        # Delete dependencies first
        db.query(NormalizedEdge).delete()
        db.query(NormalizedNode).delete()
        db.query(SnapshotDiff).delete()
        db.query(Relationship).delete()
        db.query(Resource).delete()
        db.query(ServiceScan).delete()
        db.query(ScanJob).delete()
        db.query(Snapshot).delete()
        db.query(AwsAccount).delete()
        db.commit()
        return {"success": True, "message": "Database reset successfully. All connected accounts and snapshots deleted."}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to reset database: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")