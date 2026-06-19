from app.scanners.ec2_scanner import ec2_scanner
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.models import ScanJob, ServiceScan, ScanStatus, AwsAccount
from app.services.aws_service import aws_service
from app.scanners.vpc_scanner import vpc_scanner
from app.scanners.s3_scanner import s3_scanner
from app.scanners.lambda_scanner import lambda_scanner
from app.scanners.rds_scanner import rds_scanner
from app.scanners.sqs_scanner import sqs_scanner
from app.scanners.apigateway_scanner import apigateway_scanner
from app.scanners.eventbridge_scanner import eventbridge_scanner
from app.engines.snapshot_engine import snapshot_engine
from app.engines.relationship_engine import relationship_engine
from app.database import SessionLocal
from uuid import UUID

logger = logging.getLogger(__name__)

# Regions to scan — add more later
SCAN_REGIONS = ['ap-south-1', 'us-east-1']


class ScanOrchestrator:

    def run_scan(self, scan_job_id: UUID):
        """
        Main entry point for running a full scan.
        Called by scheduler.
        """
        db = SessionLocal()
        try:
            # Get scan job
            scan_job = db.query(ScanJob).filter(
                ScanJob.id == scan_job_id
            ).first()

            if not scan_job:
                logger.error(f"Scan job {scan_job_id} not found")
                return

            # Update status to running
            scan_job.status = ScanStatus.running
            scan_job.started_at = datetime.utcnow()
            db.commit()

            # Get AWS account details
            aws_account = db.query(AwsAccount).filter(
                AwsAccount.id == scan_job.account_id
            ).first()

            if not aws_account:
                scan_job.status = ScanStatus.failed
                scan_job.error_message = "AWS account not found"
                db.commit()
                return

            # Get temporary AWS credentials
            credentials = aws_service._get_temp_credentials(
                aws_account.role_arn
            )
            if not credentials:
                scan_job.status = ScanStatus.failed
                scan_job.error_message = "Failed to get AWS credentials"
                db.commit()
                return

            aws_account_id = aws_account.account_id
            all_nodes = []
            all_edges = []
            any_failure = False

            # ── Scan each region ──────────────────
            for region in SCAN_REGIONS:
                logger.info(f"Scanning region: {region}")

                subnet_map = {}  # subnet_id → subnet_arn

                # 1. VPC + Subnet
                try:
                    vpc_result = vpc_scanner.scan(
                        credentials, region, aws_account_id
                    )
                    all_nodes.extend(vpc_result['nodes'])
                    all_edges.extend(vpc_result['edges'])

                    # Build subnet map for other scanners
                    for node_result in vpc_result['nodes']:
                        if node_result['node']['data']['service'] == 'subnet':
                            subnet_map[node_result['raw_id']] = node_result['resource_arn']

                    self._save_service_scan(
                        db, scan_job.id, 'vpc+subnet', region,
                        ScanStatus.success, len(vpc_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'vpc+subnet', region,
                        ScanStatus.failed, 0, str(e)
                    )

                # 2. EC2
                try:
                    ec2_result = ec2_scanner.scan(
                        credentials, region, aws_account_id, subnet_map
                    )
                    all_nodes.extend(ec2_result['nodes'])
                    all_edges.extend(ec2_result['edges'])
                    self._save_service_scan(
                        db, scan_job.id, 'ec2', region,
                        ScanStatus.success, len(ec2_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'ec2', region,
                        ScanStatus.failed, 0, str(e)
                    )
                
                # 3. Lambda
                try:
                    lambda_result = lambda_scanner.scan(
                        credentials, region, aws_account_id, subnet_map
                    )
                    all_nodes.extend(lambda_result['nodes'])
                    all_edges.extend(lambda_result['edges'])
                    self._save_service_scan(
                        db, scan_job.id, 'lambda', region,
                        ScanStatus.success, len(lambda_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'lambda', region,
                        ScanStatus.failed, 0, str(e)
                    )

                # 4. RDS
                try:
                    rds_result = rds_scanner.scan(
                        credentials, region, aws_account_id, subnet_map
                    )
                    all_nodes.extend(rds_result['nodes'])
                    all_edges.extend(rds_result['edges'])
                    self._save_service_scan(
                        db, scan_job.id, 'rds', region,
                        ScanStatus.success, len(rds_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'rds', region,
                        ScanStatus.failed, 0, str(e)
                    )

                # 5. SQS
                try:
                    sqs_result = sqs_scanner.scan(
                        credentials, region, aws_account_id
                    )
                    all_nodes.extend(sqs_result['nodes'])
                    all_edges.extend(sqs_result.get('edges', []))
                    self._save_service_scan(
                        db, scan_job.id, 'sqs', region,
                        ScanStatus.success, len(sqs_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'sqs', region,
                        ScanStatus.failed, 0, str(e)
                    )

                # 6. API Gateway
                try:
                    apigw_result = apigateway_scanner.scan(
                        credentials, region, aws_account_id
                    )
                    all_nodes.extend(apigw_result['nodes'])
                    all_edges.extend(apigw_result['edges'])
                    self._save_service_scan(
                        db, scan_job.id, 'apigateway', region,
                        ScanStatus.success, len(apigw_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'apigateway', region,
                        ScanStatus.failed, 0, str(e)
                    )

                # 7. EventBridge
                try:
                    eb_result = eventbridge_scanner.scan(
                        credentials, region, aws_account_id
                    )
                    all_nodes.extend(eb_result['nodes'])
                    all_edges.extend(eb_result['edges'])
                    self._save_service_scan(
                        db, scan_job.id, 'eventbridge', region,
                        ScanStatus.success, len(eb_result['nodes'])
                    )
                except Exception as e:
                    any_failure = True
                    self._save_service_scan(
                        db, scan_job.id, 'eventbridge', region,
                        ScanStatus.failed, 0, str(e)
                    )

            # 7. ── S3 (Global) ───────────────────────
            # S3 is global and not bound to a region. It is scanned once outside the region loop.
            try:
                s3_result = s3_scanner.scan(credentials, aws_account_id)
                all_nodes.extend(s3_result['nodes'])
                all_edges.extend(s3_result.get('edges', []))
                self._save_service_scan(
                    db, scan_job.id, 's3', 'global',
                    ScanStatus.success, len(s3_result['nodes'])
                )
            except Exception as e:
                any_failure = True
                self._save_service_scan(
                    db, scan_job.id, 's3', 'global',
                    ScanStatus.failed, 0, str(e)
                )

            # ── Discover Relationships (Edges) ────
            if all_nodes:
                try:
                    logger.info("Running Relationship Engine to discover resource connections...")
                    discovered_edges = relationship_engine.discover_relationships(
                        credentials=credentials,
                        region_list=SCAN_REGIONS,
                        nodes=all_nodes
                    )
                    all_edges.extend(discovered_edges)
                    logger.info(f"Relationship Engine discovered {len(discovered_edges)} communication edges.")
                except Exception as rel_err:
                    logger.error(f"Error executing Relationship Engine: {str(rel_err)}")

            # ── Create Snapshot ───────────────────
            if all_nodes:
                snapshot_engine.create_snapshot(
                    db=db,
                    account_db_id=aws_account.id,
                    all_nodes=all_nodes,
                    all_edges=all_edges,
                    aws_account_id=aws_account_id
                )

            # ── Update Scan Job Status ─────────────
            scan_job.status = ScanStatus.partial if any_failure else ScanStatus.success
            scan_job.completed_at = datetime.utcnow()
            db.commit()

            logger.info(
                f"Scan complete. "
                f"Resources: {len(all_nodes)}, "
                f"Edges: {len(all_edges)}, "
                f"Status: {scan_job.status}"
            )

        except Exception as e:
            logger.error(f"Scan orchestrator error: {str(e)}")
            if scan_job:
                scan_job.status = ScanStatus.failed
                scan_job.error_message = str(e)
                scan_job.completed_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

    def _save_service_scan(
        self, db, scan_job_id, service,
        region, status, count, error=None
    ):
        from datetime import datetime
        service_scan = ServiceScan(
            scan_job_id=scan_job_id,
            service=service,
            region=region,
            status=status,
            resources_found=count,
            error_message=error,
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow()
        )
        db.add(service_scan)
        db.commit()


scan_orchestrator = ScanOrchestrator()