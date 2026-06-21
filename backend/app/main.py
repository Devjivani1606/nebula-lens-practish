from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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


@app.get("/", response_class=HTMLResponse)
def health_check():
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>GravityLens API Status</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
                --card-bg: rgba(30, 41, 59, 0.7);
                --card-border: rgba(255, 255, 255, 0.08);
                --text-primary: #f8fafc;
                --text-secondary: #94a3b8;
                --accent-primary: #6366f1;
                --accent-secondary: #a855f7;
                --success: #10b981;
            }
            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }
            body {
                font-family: 'Outfit', sans-serif;
                background: var(--bg-gradient);
                color: var(--text-primary);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow-x: hidden;
            }
            .container {
                max-width: 600px;
                width: 90%;
                background: var(--card-bg);
                border: 1px solid var(--card-border);
                backdrop-filter: blur(16px);
                border-radius: 24px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                text-align: center;
                position: relative;
            }
            .container::before {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: linear-gradient(45deg, var(--accent-primary), var(--accent-secondary));
                border-radius: 26px;
                z-index: -1;
                opacity: 0.15;
            }
            .logo {
                font-size: 32px;
                font-weight: 800;
                background: linear-gradient(to right, #818cf8, #c084fc);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 8px;
            }
            .subtitle {
                font-size: 16px;
                color: var(--text-secondary);
                margin-bottom: 30px;
            }
            .status-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: rgba(16, 185, 129, 0.1);
                color: var(--success);
                padding: 8px 16px;
                border-radius: 9999px;
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 30px;
                border: 1px solid rgba(16, 185, 129, 0.2);
            }
            .status-dot {
                width: 8px;
                height: 8px;
                background-color: var(--success);
                border-radius: 50%;
                box-shadow: 0 0 12px var(--success);
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            .info-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 16px;
                margin-bottom: 30px;
            }
            .info-card {
                background: rgba(15, 23, 42, 0.4);
                border: 1px solid var(--card-border);
                padding: 16px;
                border-radius: 16px;
                text-align: left;
            }
            .info-label {
                font-size: 12px;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
            }
            .info-value {
                font-size: 16px;
                font-weight: 600;
            }
            .btn-group {
                display: flex;
                gap: 16px;
                justify-content: center;
            }
            .btn {
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 12px 24px;
                border-radius: 12px;
                font-weight: 600;
                text-decoration: none;
                transition: all 0.3s ease;
            }
            .btn-primary {
                background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
            }
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
            }
            .btn-secondary {
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-primary);
                border: 1px solid var(--card-border);
            }
            .btn-secondary:hover {
                background: rgba(255, 255, 255, 0.1);
                transform: translateY(-2px);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">GravityLens API</div>
            <div class="subtitle">Cloud Infrastructure Intelligence Platform</div>
            
            <div class="status-badge">
                <span class="status-dot"></span>
                API Operational
            </div>

            <div class="info-grid">
                <div class="info-card">
                    <div class="info-label">Status</div>
                    <div class="info-value">Running</div>
                </div>
                <div class="info-card">
                    <div class="info-label">Version</div>
                    <div class="info-value">1.0.0</div>
                </div>
            </div>

            <div class="btn-group">
                <a href="/docs" target="_blank" class="btn btn-primary">Interactive Docs (Swagger)</a>
                <a href="/redoc" target="_blank" class="btn btn-secondary">Alternative Docs (ReDoc)</a>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


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
