# GravityLens Backend Workflow

Here is the complete step-by-step workflow of how data moves through the GravityLens backend.

```mermaid
sequenceDiagram
    autonumber
    
    actor User as User (Frontend)
    participant API as main.py (FastAPI)
    participant DB as PostgreSQL (models.py)
    participant Sched as Background Scheduler
    participant Orch as scan_orchestrator.py
    participant Scan as AWS Scanners (boto3)
    participant Rel as relationship_engine.py
    participant Norm as normalize.py
    participant AWS as AWS APIs (Metrics/Cost)
    
    %% Phase 1: Triggering the Scan
    Note over User, DB: Phase 1: Asynchronous Trigger
    User->>API: POST /api/scan/trigger (Click "Scan")
    API->>DB: Save ScanJob (status="pending")
    API-->>User: "Scan Queued" (Fast Response)
    
    %% Phase 2: The Raw Scan
    Note over Sched, Rel: Phase 2: Orchestration & Scraping
    Sched->>DB: Query for "pending" jobs (every 5 mins)
    DB-->>Sched: Returns ScanJob
    Sched->>Orch: Start run_scan(job_id)
    Orch->>Scan: Assume Role & Trigger all Scanners
    Scan-->>Orch: Return raw Nodes (Servers, DBs, etc.)
    Orch->>Rel: Pass all raw Nodes
    Rel-->>Orch: Return Edges (Communication links)
    Orch->>DB: Save complete "Snapshot" (Raw Nodes + Edges)
    Orch->>DB: Mark ScanJob as "success"
    
    %% Phase 3: The Normalization & Delivery
    Note over User, AWS: Phase 3: Frontend Request & Normalization
    User->>Norm: POST /api/normalize/account (Load Dashboard)
    Norm->>DB: Fetch latest raw Snapshot
    DB-->>Norm: Returns raw Nodes & Edges
    Norm->>Norm: Infer missing Virtual Nodes
    Norm->>AWS: Fetch CloudWatch Metrics & Pricing
    AWS-->>Norm: Returns Live CPU/Memory & $ Cost
    Norm->>Norm: topology.py calculates X/Y grid layout
    Norm->>DB: Save to NormalizedNode & NormalizedEdge
    Norm-->>User: Return fully enriched JSON to React Flow
```

## Explanation of Phases

1. **Phase 1: Asynchronous Trigger**: We don't make the user wait while we scan. The API quickly saves a ticket to the database and tells the user "We are working on it."
2. **Phase 2: Orchestration & Scraping**: The background worker wakes up, gathers the raw puzzle pieces from AWS using `boto3`, asks the relationship engine how they connect, and saves the raw snapshot to the vault.
3. **Phase 3: Normalization & Delivery**: When the user actually wants to look at the graph, the Normalizer pulls the raw data from the vault, cleans it up, adds expensive metrics and pricing data, calculates the physical X/Y grid positions, and delivers the final masterpiece to the frontend browser.
