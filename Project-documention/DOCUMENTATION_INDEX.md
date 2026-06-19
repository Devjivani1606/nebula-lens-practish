# GravityLens Documentation Index

> **Complete documentation structure for the GravityLens project**

This file outlines the complete documentation structure. Right now, we have:

1. ✅ **README.md** — What is GravityLens and high-level problem definition
2. ✅ **PROBLEM_DEFINITION.md** — Deep dive into problems with real-world scenarios

The following documents will be created in Phase 2:

---

## Documentation Map

```
gravitylens/
├─ README.md ✅
│  ├─ What is GravityLens?
│  ├─ The Problem (overview)
│  ├─ Current Solutions and Limits
│  ├─ Why GravityLens is Different
│  └─ How It Works
│
├─ PROBLEM_DEFINITION.md ✅
│  ├─ Scenario 1: 3 AM Crisis (MTTR problem)
│  ├─ Scenario 2: Onboarding (time to productivity)
│  ├─ Scenario 3: Hidden Costs (visibility problem)
│  ├─ Scenario 4: Security Audit (audit trail problem)
│  ├─ Scenario 5: Accidental Outage (blast radius problem)
│  ├─ Root Cause Analysis
│  └─ Business Impact Summary
│
├─ ARCHITECTURE.md (Coming soon)
│  ├─ System Architecture Diagram
│  ├─ Technology Stack
│  ├─ Data Flow (end to end)
│  ├─ Backend Services
│  │  ├─ Scanners (how they work)
│  │  ├─ Engines (how discovery works)
│  │  ├─ APIs (endpoints)
│  │  └─ Database Schema
│  ├─ Frontend Pages
│  │  ├─ Landing
│  │  ├─ Onboarding
│  │  ├─ Dashboard
│  │  ├─ History
│  │  ├─ Diff Viewer
│  │  └─ Replay
│  ├─ Design System
│  │  ├─ Colors
│  │  ├─ Typography
│  │  ├─ Components
│  │  └─ Animations
│  └─ Security Model
│
├─ API_ENDPOINTS.md (Coming soon)
│  ├─ Authentication
│  ├─ AWS Account Management
│  │  ├─ POST /api/aws/connect
│  │  ├─ GET /api/aws/accounts
│  │  └─ GET /api/aws/accounts/{id}/status
│  ├─ Scanning
│  │  ├─ POST /api/scan/trigger/{account_id}
│  │  └─ GET /api/dashboard/scan-status/{account_id}
│  ├─ Dashboard Queries
│  │  ├─ GET /api/dashboard/latest/{aws_account_id}
│  │  ├─ GET /api/dashboard/history/{aws_account_id}
│  │  ├─ GET /api/dashboard/snapshot/{snapshot_id}/graph
│  │  ├─ GET /api/dashboard/diff/{from_id}/{to_id}
│  │  └─ GET /api/dashboard/replay/{from_id}/{to_id}
│  ├─ Error Handling
│  └─ Rate Limiting
│
├─ SCANNER_GUIDE.md (Coming soon)
│  ├─ How Scanners Work
│  ├─ VPC + Subnet Scanner
│  ├─ EC2 Scanner
│  ├─ Lambda Scanner
│  ├─ RDS Scanner
│  ├─ S3 Scanner
│  ├─ SQS Scanner
│  ├─ API Gateway Scanner
│  ├─ Pagination & Backoff
│  └─ Error Handling
│
├─ RELATIONSHIP_ENGINE.md (Coming soon)
│  ├─ How Relationships Are Discovered
│  ├─ Structural Relationships (VPC→Subnet→EC2)
│  ├─ Application Relationships (API Gateway→Lambda→SQS)
│  ├─ Normalization
│  ├─ Fingerprinting
│  ├─ Snapshot Creation
│  ├─ Diff Calculation
│  └─ Replay Animation
│
├─ DEPLOYMENT.md (Coming soon)
│  ├─ Local Development
│  │  ├─ Docker Setup
│  │  ├─ Environment Variables
│  │  └─ Running the Stack
│  ├─ Production Deployment
│  │  ├─ AWS Infrastructure
│  │  ├─ Database Setup
│  │  ├─ Environment Configuration
│  │  └─ Monitoring & Logging
│  ├─ Scaling Considerations
│  └─ Troubleshooting
│
├─ TESTING.md (Coming soon)
│  ├─ Backend Testing
│  │  ├─ Unit Tests (scanners, engines)
│  │  ├─ Integration Tests (scanner → database)
│  │  └─ E2E Tests (full scan flow)
│  ├─ Frontend Testing
│  │  ├─ Component Tests
│  │  ├─ Page Tests
│  │  └─ Visual Regression
│  └─ Test Coverage Goals
│
├─ ROADMAP.md (Coming soon)
│  ├─ Phase 1: MVP (Now)
│  ├─ Phase 2: Enhanced Discovery (Next)
│  ├─ Phase 3: Intelligence Layer
│  ├─ Phase 4: Enterprise Features
│  └─ Future Considerations
│
└─ CONTRIBUTING.md (Coming soon)
   ├─ Code Style Guide
   ├─ Git Workflow
   ├─ Submitting Changes
   └─ Community Guidelines
```

---

## Current Status

### ✅ Completed

1. **README.md**
   - Executive overview of GravityLens
   - Problem statement (high-level)
   - Solution overview
   - How it works (conceptual)
   - Target audience

2. **PROBLEM_DEFINITION.md**
   - Five real-world scenarios
   - Detailed pain points
   - Root cause analysis
   - Business impact with metrics
   - ROI calculation

### 📋 Next Priority (Phase 2)

1. **ARCHITECTURE.md**
   - System design diagrams
   - Technology stack details
   - Backend/frontend architecture
   - Data flow
   - Database schema explanation
   - Security model

2. **API_ENDPOINTS.md**
   - Complete API reference
   - Request/response examples
   - Error handling
   - Rate limiting

3. **SCANNER_GUIDE.md**
   - How each scanner works
   - Relationship discovery methods
   - Boto3 usage
   - Error handling and retries

### ⏳ Future (Phase 3+)

- Deployment guide
- Testing strategy
- Roadmap
- Contributing guidelines

---

## How to Use This Documentation

### For Stakeholders/Senior Engineers

Start here:
1. **README.md** (5 min read) — understand what GravityLens is
2. **PROBLEM_DEFINITION.md** (15 min read) — understand why it matters

### For Architects

Read after stakeholder docs:
1. **ARCHITECTURE.md** — understand the system design
2. **DEPLOYMENT.md** — understand how to run it

### For Backend Engineers

Read after architecture:
1. **SCANNER_GUIDE.md** — understand how discovery works
2. **RELATIONSHIP_ENGINE.md** — understand how relationships are built
3. **API_ENDPOINTS.md** — understand the API contract

### For Frontend Engineers

Read after architecture:
1. **ARCHITECTURE.md** (frontend section) — understand the UI design
2. **API_ENDPOINTS.md** — understand the API contract
3. **DESIGN_SYSTEM.md** (when available) — understand the design language

### For DevOps/Operations

Read after architecture:
1. **DEPLOYMENT.md** — understand how to deploy
2. **TESTING.md** — understand how to test
3. **TROUBLESHOOTING.md** (when available) — understand how to debug

---

## Documentation Principles

Every document follows these principles:

### 1. **Start with Context**
Every document begins with:
- **What** — what is this document about?
- **Why** — why does it matter?
- **Who** — who should read this?

### 2. **Use Real Examples**
- Pseudo-code, not abstract explanations
- Real AWS service names, not "ServiceA" and "ServiceB"
- Actual architecture patterns used in production

### 3. **Include Diagrams**
- System architecture
- Data flow
- Database schema
- User workflows

### 4. **Explain Trade-offs**
- Why we chose this approach over that one
- What we're optimizing for (speed, cost, simplicity)
- What we're sacrificing

### 5. **Link to Related Docs**
- Cross-references between documents
- "See ARCHITECTURE.md for more details"
- Breadcrumb navigation

---

## How to Contribute Documentation

When writing new documentation:

1. **Follow the structure** — use the same format as existing docs
2. **Use headers consistently** — H1 for title, H2 for sections, H3 for subsections
3. **Include a table of contents** — so readers can jump to sections
4. **Add diagrams** — at least one diagram per major concept
5. **Provide examples** — pseudo-code, API examples, etc.
6. **Link to related docs** — help readers understand the full picture
7. **Update this index** — when you add a new document

---

## Current Project Status

**Backend:** ✅ Complete (100%)
- All 8 service scanners working
- All engines implemented (normalizer, snapshot, diff, replay)
- All API endpoints functional
- Database schema complete

**Frontend:** ✅ Complete (100%)
- All 6 pages built
- All components implemented
- Design system established
- Interactive features working

**Documentation:** 🟡 In Progress (20%)
- README.md ✅
- PROBLEM_DEFINITION.md ✅
- ARCHITECTURE.md 📋
- API_ENDPOINTS.md 📋
- Everything else ⏳

**Next:** Connect frontend to real backend and create ARCHITECTURE.md

---

## Questions?

If you have questions about:
- **What GravityLens is?** → Read README.md
- **Why it matters?** → Read PROBLEM_DEFINITION.md
- **How it works?** → Read ARCHITECTURE.md (coming soon)
- **How to deploy?** → Read DEPLOYMENT.md (coming soon)
- **How to contribute?** → Read CONTRIBUTING.md (coming soon)

---

**Last Updated:** 2026-06-19
**Next Update:** After ARCHITECTURE.md is written
