# GravityLens: Timeline Feature Planning

> **Complete UX & Technical Planning for the Timeline Feature**
> 
> **Goal:** Build a smooth, intuitive timeline interface that shows infrastructure evolution over time — before writing any code

---

## Table of Contents

- [Part 1: Timeline Feature Overview](#part-1-timeline-feature-overview)
- [Part 2: User Experience Design](#part-2-user-experience-design)
- [Part 3: Visual Design & Smoothness](#part-3-visual-design--smoothness)
- [Part 4: Data Structure](#part-4-data-structure)
- [Part 5: What to Include in Timeline](#part-5-what-to-include-in-timeline)
- [Part 6: Feature Breakdown](#part-6-feature-breakdown)
- [Part 7: Implementation Strategy](#part-7-implementation-strategy)

---

## Part 1: Timeline Feature Overview

### What is the Timeline Feature?

The Timeline is a **historical view** of your infrastructure evolution.

**Current State (you have this):**
- Dashboard shows infrastructure **now** (latest snapshot)
- Interactive graph of current resources

**Timeline Feature (we're building this):**
- View infrastructure at **any point in time**
- See what **changed** between versions
- Visual **timeline** of versions
- Compare/replay features integration

### Why Does It Matter?

```
Without Timeline:
├─ "What did we have last week?" → Can't answer
├─ "When did this cost increase?" → Manual digging
└─ "Was this resource here originally?" → Unknown

With Timeline:
├─ "What did we have last week?" → Click version 5
├─ "When did cost increase?" → Timeline shows it
└─ "Was this resource here?" → See in history
```

---

## Part 2: User Experience Design

### The Mental Model

Think of it like **Git commit history for your cloud**:

```
Git Commits:               GravityLens Timeline:
──────────────────────────────────────────────
v3: "Added user auth"      v3: "Added Lambda function"
v2: "Fixed login bug"      v2: "Increased RDS storage"
v1: "Initial setup"        v1: "First scan"

Click a commit             Click a version
→ See that exact code      → See that exact infrastructure
```

### User Flow

**Scenario: DevOps engineer investigating a cost spike**

```
1. Open GravityLens
   └─ Sees Dashboard (current infrastructure)

2. Click "Timeline" tab
   └─ See: Vertical timeline with version cards stacked

3. Look at timeline
   ├─ Version 5 (Today) — 8 EC2, 3 VPC, Cost: $450/month
   ├─ Version 4 (Yesterday) — 7 EC2, 3 VPC, Cost: $420/month
   ├─ Version 3 (2 days ago) — 6 EC2, 3 VPC, Cost: $390/month ← Cost jumped here!
   └─ Click on Version 3 card

4. See version details
   ├─ Resource count summary
   ├─ Cost breakdown
   ├─ "Compare to Previous" button
   └─ "View Graph" button

5. Click "Compare to Previous"
   └─ See Diff: "Added 1 EC2 instance (t3.large) = $30/month"

6. Click "View Graph"
   └─ See the graph at that exact point in time
   └─ Click the new EC2 node to see details
```

### Timeline UI Layout

```
┌─────────────────────────────────────────────┐
│  GravityLens              📊 Timeline        │
├─────────────────────────────────────────────┤
│                                             │
│  Vertical Timeline                          │
│  ●────────────────────────────────────────  │
│  │  Version 5 (Latest)                     │
│  │  Today 14:30                            │
│  │  8 EC2 · 3 VPC · 2 RDS · 5 Lambda      │
│  │  💰 $450/month                          │
│  │  ✨ +1 Added  -0 Removed  ~0 Modified    │
│  │  [View] [Compare] [Replay]              │
│  │                                          │
│  ●────────────────────────────────────────  │
│  │  Version 4                               │
│  │  Yesterday 10:15                        │
│  │  7 EC2 · 3 VPC · 2 RDS · 4 Lambda      │
│  │  💰 $420/month                          │
│  │  ✨ ~1 Modified                         │
│  │  [View] [Compare] [Replay]              │
│  │                                          │
│  ●────────────────────────────────────────  │
│  │  Version 3                               │
│  │  2 days ago 08:45                       │
│  │  6 EC2 · 3 VPC · 2 RDS · 3 Lambda      │
│  │  💰 $390/month                          │
│  │  ✨ +1 Added                            │
│  │  [View] [Compare] [Replay]              │
│  │                                          │
│  ├─ More versions...                       │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Part 3: Visual Design & Smoothness

### Design Principles for Smoothness (Apple-Level)

#### Principle 1: Vertical Timeline with Animated Line

**Current Design:**
```
Simple vertical line connecting versions
```

**Make it smooth:**
```
1. Line animates in from top to bottom on page load
   - Duration: 0.6s
   - Easing: ease-out (starts fast, ends slow)

2. Version cards animate in sequentially
   - Card 1 slides in from left (0.3s delay)
   - Card 2 slides in from left (0.5s delay)
   - Card 3 slides in from left (0.7s delay)
   - Each card has its own fade-in + scale (0.4s)
```

**CSS Animation:**
```css
.timeline-line {
  animation: drawLine 0.6s ease-out forwards;
}

@keyframes drawLine {
  from { height: 0; }
  to { height: 100%; }
}

.version-card {
  animation: slideInCard 0.4s ease-out forwards;
}

.version-card:nth-child(1) { animation-delay: 0.2s; }
.version-card:nth-child(2) { animation-delay: 0.4s; }
.version-card:nth-child(3) { animation-delay: 0.6s; }

@keyframes slideInCard {
  from {
    opacity: 0;
    transform: translateX(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}
```

#### Principle 2: Dot Animation (Version Markers)

**Smooth dots on timeline:**
```
Dots pulse softly when page loads
- Pulse: white → glow → white
- Duration: 2.5 seconds
- Staggered so dots light up one by one

Dot turns primary color when hovered
- Transition: 0.15s
- Grows slightly: 6px → 8px
```

**CSS:**
```css
.timeline-dot {
  animation: dotPulse 2.5s ease-in-out infinite;
  cursor: pointer;
  transition: transform 0.15s, background-color 0.15s;
}

.timeline-dot:nth-child(1) { animation-delay: 0s; }
.timeline-dot:nth-child(2) { animation-delay: 0.3s; }
.timeline-dot:nth-child(3) { animation-delay: 0.6s; }

.timeline-dot:hover {
  transform: scale(1.33);
  background-color: var(--primary);
}

@keyframes dotPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.2); }
}
```

#### Principle 3: Hover & Interaction Smoothness

**Version card hover effect:**
```
On hover (no click yet):
- Background color brightens slightly
- Border gets a soft glow
- Shadow increases (feels like it lifts)
- Transition: 0.2s (faster than animation)

On click:
- Card slides slightly right (feedback)
- Detail panel opens to the right
- Timeline stays visible on the left
```

**CSS:**
```css
.version-card {
  transition: all 0.2s ease-out;
  border: 1px solid transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.version-card:hover {
  background-color: var(--surface-light);
  border-color: var(--primary);
  box-shadow: 0 8px 16px rgba(99, 102, 241, 0.15);
  transform: translateX(4px);
}

.version-card:active {
  transform: translateX(2px);
}
```

#### Principle 4: Smooth Transitions Between Views

**When user clicks a version card:**
```
Timeline View → Detail View:

1. Version card gets a highlight border (0.2s)
2. Detail panel slides in from right (0.35s, ease-out)
3. Detail content fades in (0.4s)
4. Buttons appear with staggered fade-in (0.3s each)

If user clicks "View Graph":
5. Graph loads (can take 1-2 seconds)
6. Nodes fade in (0.5s total)
7. Edges draw with animation (0.8s)
```

---

## Part 4: Data Structure

### What Data Do We Store?

For each **version** (snapshot), store:

```
Version {
  version_id: "snap-abc123"
  version_number: 5
  label: "Added Lambda function"  ← User-friendly name
  created_at: 2026-06-20T14:30:00
  
  # Resource counts
  summary: {
    ec2: 8,
    rds: 3,
    lambda: 5,
    s3: 2,
    sqs: 1,
    apigateway: 1,
    total: 20
  }
  
  # Costs
  costs: {
    total_monthly: 450.87,
    by_service: {
      ec2: 150.50,
      rds: 280.32,
      lambda: 15.05,
      s3: 4.00,
      ...
    }
  }
  
  # What changed from previous version
  changes: {
    added: 1,           # 1 new resource
    removed: 0,         # 0 deleted resources
    modified: 0         # 0 changed resources
  }
  
  # Full snapshot data (for "View Graph")
  graph: {
    nodes: [...],
    edges: [...]
  }
}
```

### Timeline Query Response

**Endpoint:** `GET /api/dashboard/history/{aws_account_id}`

```json
{
  "status": "success",
  "versions": [
    {
      "version_id": "snap-5",
      "version_number": 5,
      "label": "Added web-server-2 EC2",
      "is_latest": true,
      "created_at": "2026-06-20T14:30:00Z",
      "summary": {
        "ec2": 8,
        "rds": 3,
        "lambda": 5,
        "s3": 2,
        "sqs": 1,
        "apigateway": 1,
        "total_resources": 20
      },
      "costs": {
        "total_monthly": 450.87,
        "by_service": {
          "ec2": 150.50,
          "rds": 280.32,
          "lambda": 15.05,
          "s3": 4.00,
          "sqs": 0.40,
          "apigateway": 0.60
        }
      },
      "changes": {
        "added": 1,
        "removed": 0,
        "modified": 0,
        "summary": "+1 EC2 instance"
      }
    },
    {
      "version_id": "snap-4",
      "version_number": 4,
      "label": "Increased RDS storage",
      "is_latest": false,
      "created_at": "2026-06-19T10:15:00Z",
      "summary": {
        "ec2": 7,
        "rds": 3,
        "lambda": 4,
        "s3": 2,
        "sqs": 1,
        "apigateway": 1,
        "total_resources": 18
      },
      "costs": {
        "total_monthly": 420.50,
        "by_service": {
          "ec2": 120.00,
          "rds": 280.32,
          "lambda": 15.05,
          "s3": 4.00,
          "sqs": 0.40,
          "apigateway": 0.60
        }
      },
      "changes": {
        "added": 0,
        "removed": 0,
        "modified": 1,
        "summary": "~RDS modified"
      }
    }
  ],
  "total_versions": 5
}
```

---

## Part 5: What to Include in Timeline

### Core Elements (Must Have)

```
✅ Version number & date
✅ Version label/description
✅ Resource count summary
✅ Monthly cost total
✅ Change indicators (+X added, -Y removed, ~Z modified)
✅ "View Graph" button
✅ "Compare" button
✅ Vertical timeline visualization
```

### Enhanced Elements (Nice to Have)

```
📌 User who triggered the scan
📌 Scan duration/performance info
📌 Per-service cost breakdown (collapsible)
📌 Show if scan was manual or auto-triggered
📌 Search/filter by date or resource type
📌 Zoom in/out to see time periods
```

### What NOT to Include (Keep It Clean)

```
❌ Raw JSON data
❌ Database IDs
❌ Complex technical metrics
❌ All resource details (save for "View Graph")
❌ Changelog of every single change (summary is enough)
```

---

## Part 6: Feature Breakdown

### Feature 1: Timeline Display (Vertical)

**What it shows:**
- Vertical line with dots at key points
- Version cards in chronological order
- Latest version at top, oldest at bottom

**Smoothness aspects:**
- Line draws on load (0.6s)
- Cards fade in staggered (0.3s intervals)
- Dots pulse on load
- Hover effect on cards (0.2s transition)

**Complexity:** LOW (1-2 days)

---

### Feature 2: Version Detail Panel

**What it shows:**
- Full version info (number, date, label)
- Resource count breakdown
- Cost summary
- Change indicators (added/removed/modified counts)

**Smoothness aspects:**
- Panel slides in from right (0.35s)
- Content fades in (0.4s)
- Buttons appear sequentially (0.3s)
- Close button simple fade (0.2s)

**Complexity:** LOW (1 day)

---

### Feature 3: "View Graph" Button

**What it does:**
- Fetches the snapshot graph
- Shows the infrastructure at that exact version
- Same interactive graph as Dashboard

**Smoothness aspects:**
- Loading spinner while fetching
- Nodes/edges fade in (0.5s)
- Can transition back to Timeline smoothly

**Complexity:** LOW (1 day - mostly reuses dashboard)

---

### Feature 4: Compare Button

**What it does:**
- Shows diff between this version and the previous one
- Lists added/removed/modified resources
- Highlights changes

**Smoothness aspects:**
- Diff panel slides in (0.35s)
- Changes animate in with colors (green for added, red for removed, yellow for modified)
- Each change item fades in sequentially

**Complexity:** MEDIUM (2-3 days)

---

### Feature 5: Timeline Search/Filter (Future)

**What it does:**
- Filter versions by date range
- Filter by resource changes
- Quick jump to specific version

**Complexity:** MEDIUM (not MVP)

---

## Part 7: Implementation Strategy

### Build Order (Week by Week)

```
Week 1: Core Timeline
├─ Timeline vertical display (4 hours)
├─ Version cards with animations (4 hours)
├─ Timeline dots with pulse effect (3 hours)
└─ Basic styling & responsive layout (4 hours)
Total: 1 week

Week 2: Detail & Interactivity
├─ Detail panel slide-in (3 hours)
├─ "View Graph" button integration (4 hours)
├─ Timeline line animation (2 hours)
└─ Hover/interaction effects (3 hours)
Total: ~1 week

Week 3: Compare & Polish
├─ Compare diff feature (6 hours)
├─ Smooth transitions between views (4 hours)
├─ Loading states (2 hours)
└─ Bug fixes & refinement (4 hours)
Total: ~2 weeks (can be done in parallel with Week 2)
```

### Phase 1: MVP (What to Build First)

```
✅ Vertical timeline display
✅ Version cards (date, cost, resource count)
✅ Timeline animations (line, dots, card fade-in)
✅ View Graph button
✅ Detail panel

⏳ Phase 2:
├─ Compare feature
├─ Search/filter
└─ Advanced analytics

❌ Phase 3+:
├─ Custom labels editing
├─ Branching/hypotheticals
└─ Export capabilities
```

### Code Structure Plan

```
frontend/src/
├─ pages/
│  └─ timeline/
│     └─ index.tsx  ← Main timeline page
│
├─ components/
│  └─ timeline/
│     ├─ TimelineContainer.tsx
│     ├─ VersionCard.tsx
│     ├─ TimelineVisual.tsx (SVG line + dots)
│     ├─ DetailPanel.tsx
│     ├─ ComparePanel.tsx
│     └─ styles.css (animations)
│
└─ hooks/
   └─ useTimeline.ts  ← Data fetching
```

### What the Timeline Page Will Look Like

```
┌────────────────────────────────────────────────────────┐
│ ← Back    GravityLens Timeline      🔄 Refresh        │
├────────────────────────────────────────────────────────┤
│                                                         │
│ Left: Timeline (60%)        Right: Detail (40%)        │
│ ────────────────────────────────────────────────────   │
│ ●─────────────────            ┌──────────────────────┐ │
│ │ Scan 5 (Today)             │ Version 5            │ │
│ │ 14:30 · 20 resources       │ Added: 1             │ │
│ │ 💰 $450/mo                 │ Removed: 0           │ │
│ │ ✨ +1                       │ Modified: 0          │ │
│ │ [View] [Compare] [Replay]  │ 💰 $450.87/month     │ │
│ │                             │                      │ │
│ ●─────────────────            │ [View Graph]         │ │
│ │ Scan 4 (Yesterday)         │ [Compare with V4]    │ │
│ │ 10:15 · 18 resources       │ [Replay V4→V5]       │ │
│ │ 💰 $420/mo                 │                      │ │
│ │ ✨ ~1                       │ ✕ Close              │ │
│ │ [View] [Compare] [Replay]  └──────────────────────┘ │
│ │                                                       │
│ ●─────────────────                                      │
│ │ Scan 3 (2 days ago)                                  │
│ │ 08:45 · 16 resources                                │
│ │ 💰 $390/mo                                           │
│ │ ✨ +1                                                │
│ │ [View] [Compare] [Replay]                           │
│ │                                                      │
└────────────────────────────────────────────────────────┘
```

---

## Summary: Timeline Feature Planning

### UX Foundation
✅ Clear mental model (Git-like commits)
✅ Smooth animations (Apple-level)
✅ Intuitive navigation (Timeline → Detail → Graph)

### Design
✅ Vertical timeline with animated line
✅ Version cards with hover effects
✅ Pulsing dots for visual interest
✅ Smooth transitions between views

### Data
✅ Efficient API response (summary + full snapshot)
✅ Cost tracking per version
✅ Change tracking (added/removed/modified)

### MVP Scope
✅ Timeline display + cards
✅ Detail panel
✅ View Graph integration
⏳ Compare (Phase 2)
⏳ Search/filter (Phase 3)

### Build Timeline
- **Week 1:** Core timeline display + animations
- **Week 2:** Detail panel + View Graph integration
- **Week 3:** Compare feature + polish

---

## Next Steps (Before Coding)

1. ✅ **Understand the flow** (you're reading this!)
2. ⏳ **Design decisions:** Do you want labels editable? Auto-generated?
3. ⏳ **Color scheme:** Which colors for added/removed/modified?
4. ⏳ **Animations:** Is 0.6s line animation too fast/slow for your taste?
5. ⏳ **API response:** Backend ready to return version history?

**Ready to code?** We'll create:
1. TimelineContainer component (fetches data)
2. VersionCard component (displays each version)
3. TimelineVisual component (SVG line + dots)
4. DetailPanel component (shows info)
5. CSS animations (smoothness)

---

**This is your implementation blueprint.** Everything above should be done before writing code. Once you approve this plan, we can start building! 🚀
