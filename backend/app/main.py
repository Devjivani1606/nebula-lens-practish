from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import aws_accounts, graph, normalize, analyze, db_inspector
from app.models.models import ScanJob, ScanStatus
from app.database import SessionLocal
# pyrefly: ignore [missing-import]
from apscheduler.schedulers.background import BackgroundScheduler
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

# Ensure confidence and evidence columns exist in PostgreSQL if table is already created
from sqlalchemy import text
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE relationships ADD COLUMN IF NOT EXISTS confidence INTEGER;"))
        conn.execute(text("ALTER TABLE relationships ADD COLUMN IF NOT EXISTS evidence JSONB;"))
    logger.info("Database alter statements executed successfully (if needed).")
except Exception as e:
    logger.warning(f"Database alter statements failed or not applicable (e.g. SQLite/existing): {e}")

app = FastAPI(
    title="GravityLens API",
    description="Cloud Infrastructure Intelligence Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(aws_accounts.router)
app.include_router(graph.router)
app.include_router(normalize.router)
app.include_router(analyze.router)
app.include_router(db_inspector.router)


def process_pending_scans():
    """
    Scheduler runs every 5 minutes.
    Picks up pending scan jobs and runs them.
    """
    from app.engines.scan_orchestrator import scan_orchestrator

    db = SessionLocal()
    try:
        pending_jobs = db.query(ScanJob).filter(
            ScanJob.status == ScanStatus.pending
        ).limit(5).all()

        for job in pending_jobs:
            logger.info(f"Processing scan job: {job.id}")
            scan_orchestrator.run_scan(job.id)

    except Exception as e:
        logger.error(f"Scheduler error: {str(e)}")
    finally:
        db.close()


# Start scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(
    process_pending_scans,
    "interval",
    seconds=300,
    max_instances=1,
    coalesce=True
)
scheduler.start()


@app.get("/")
def health_check():
    return {
        "status": "running",
        "product": "GravityLens API",
        "version": "1.0.0"
    }


@app.post("/api/scan/trigger/{account_id}")
def trigger_manual_scan(account_id: str):
    """Manually trigger a scan for testing."""
    from app.models.models import AwsAccount

    db = SessionLocal()
    try:
        account = db.query(AwsAccount).filter(
            AwsAccount.account_id == account_id
        ).first()

        if not account:
            return {"error": "Account not found"}

        job = ScanJob(
            account_id=account.id,
            status=ScanStatus.pending,
            triggered_by="manual"
        )
        db.add(job)
        db.commit()

        return {"message": "Scan queued", "job_id": str(job.id)}

    finally:
        db.close()
