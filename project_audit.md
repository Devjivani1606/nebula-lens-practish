# Nebula-Lens — Full Project Audit

> **Read-only audit. Nothing has been modified.**

---

## 1. PROJECT STRUCTURE

```
nebula-lens/
├── .git/
├── .gitignore
├── .next/                          (build output)
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── components.json
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── node_modules/
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── tsconfig.tsbuildinfo
├── public/
│   ├── GravityLance_Layout.png
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   ├── window.svg
│   ├── icons/
│   │   ├── amazon-api-gateway.svg
│   │   ├── amazon-dynamodb.svg
│   │   ├── amazon-lambda.svg
│   │   ├── amazon-rds.svg
│   │   ├── amazon-simple-queue-service.svg
│   │   ├── amazon-simple-storage-service.svg
│   │   ├── amazon-virtual-private-cloud.svg
│   │   └── aws-public-subnet.svg
│   └── logo/
│       ├── singleLogo.svg
│       └── subLogo.svg
└── src/
    ├── app/
    │   ├── favicon.ico
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx                     [CANVAS] — mounts ArchitectureCanvas
    │   └── api/
    │       └── infrastructure/
    │           └── route.ts             [CANVAS] — mock data API endpoint
    ├── components/
    │   ├── canvas/
    │   │   ├── ArchitectureCanvas.tsx    [CANVAS] — ReactFlow mount point
    │   │   └── AnimatedEdge.tsx          [CANVAS] — custom edge renderer
    │   ├── nodes/
    │   │   ├── ApiGatewayNode.tsx        [CANVAS] — apiGatewayNode type
    │   │   ├── DatabaseNode.tsx          [CANVAS] — databaseNode type
    │   │   ├── LambdaNode.tsx            [CANVAS] — lambdaNode type
    │   │   ├── S3Node.tsx               [CANVAS] — s3Node type
    │   │   ├── SqsNode.tsx              [CANVAS] — sqsNode type
    │   │   ├── SubnetNode.tsx           [CANVAS] — Subnet type
    │   │   └── VpcNode.tsx              [CANVAS] — VPC + IGW types
    │   └── ui/
    │       ├── LensToolbar.tsx          [CANVAS] — lens switcher panel
    │       ├── MetricsSidebar.tsx        [CANVAS] — node detail sheet
    │       ├── TopNav.tsx               [CANVAS] — top navigation bar
    │       ├── badge.tsx                (shadcn primitive)
    │       ├── button.tsx               (shadcn primitive)
    │       ├── separator.tsx            (shadcn primitive)
    │       └── sheet.tsx                (shadcn primitive)
    ├── data/
    │   ├── architecture.json            (unused, older mock)
    │   ├── graph.json                   (unused)
    │   ├── latestdata.json              [CANVAS] — **actively imported** static fallback
    │   └── transformed_architecture.json (unused)
    ├── hooks/
    │   └── useLensVisuals.ts            [CANVAS] — per-node visual state hook
    ├── lib/
    │   ├── layoutUtils.ts               [CANVAS] — ELK layout engine
    │   └── utils.ts                     (cn() helper)
    └── store/
        └── useCanvasStore.ts            [CANVAS] — Zustand + Zundo store
```

---

## 2. REACT FLOW SETUP

**File:** [ArchitectureCanvas.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/ArchitectureCanvas.tsx)

```tsx
'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, Panel, MiniMap} from '@xyflow/react';
import { useStore } from 'zustand';
import { useCanvasStore } from '../../store/useCanvasStore';

import LambdaNode from '../nodes/LambdaNode';
import S3Node from '../nodes/S3Node';
import DatabaseNode from '../nodes/DatabaseNode';
import AnimatedEdge from './AnimatedEdge';
import VpcNode from '../nodes/VpcNode';
import SubnetNode from '../nodes/SubnetNode';
import ApiGatewayNode from '../nodes/ApiGatewayNode';
import SqsNode from '../nodes/SqsNode';
import MetricsSidebar from '../ui/MetricsSidebar';
import LensToolbar from '../ui/LensToolbar';
import TopNav from '../ui/TopNav';
import { Button } from '@/components/ui/button';


// Spring-like easing: fast start with a gentle overshoot
function springEase(t: number): number {
  return 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.5);
}

const ANIMATION_DURATION = 400; // ms

export default function ArchitectureCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectedNodeId,
    setSelectedNodeId,
    activeLens,
    setActiveLens,
    fetchInfrastructure,
    isLoading
  } = useCanvasStore();

  const nodeTypes = React.useMemo(() => ({
    lambdaNode: LambdaNode,
    s3Node: S3Node,
    databaseNode: DatabaseNode,
    VPC: VpcNode,
    IGW: VpcNode,
    Subnet: SubnetNode,
    apiGatewayNode: ApiGatewayNode,
    sqsNode: SqsNode,
  }), []);

  const edgeTypes = React.useMemo(() => ({ animatedEdge: AnimatedEdge }), []);


  const { undo, redo, pastStates, futureStates } = useStore(
    useCanvasStore.temporal,
    (state) => state
  );

  const animationRef = useRef<number | null>(null);

  // Animate nodes from old positions to new positions by interpolating
  const animateTransition = useCallback((
    oldPositions: Map<string, { x: number; y: number }>,
    targetNodes: typeof nodes  // The final target state captured BEFORE animation starts
  ) => {
    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      // If cancelling a previous animation, resume tracking before starting new one
      useCanvasStore.temporal.getState().resume();
    }

    // Pause temporal tracking so intermediate frames don't pollute undo history
    useCanvasStore.temporal.getState().pause();

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
      const eased = springEase(progress);

      // Interpolate from old → target using the captured snapshot
      const interpolatedNodes = targetNodes.map((node) => {
        const oldPos = oldPositions.get(node.id);
        if (!oldPos) return node;

        if (
        oldPos.x === node.position.x &&
        oldPos.y === node.position.y
        ) {
        return node;
        }

        const x = oldPos.x + (node.position.x - oldPos.x) * eased;
        const y = oldPos.y + (node.position.y - oldPos.y) * eased;

        return {
          ...node,
          position: { x, y },
        };
      });

      useCanvasStore.setState({ nodes: interpolatedNodes });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        // Land exactly on target positions
        useCanvasStore.setState({ nodes: targetNodes });
        animationRef.current = null;
        // Resume temporal tracking now that animation is complete
        useCanvasStore.temporal.getState().resume();
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const executeUndo = useCallback(() => {
    if (pastStates.length > 0) {
      const currentNodes = useCanvasStore.getState().nodes;
      const oldPositions = new Map(
        currentNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
      );
      undo();
      const targetNodes = [...useCanvasStore.getState().nodes];
      animateTransition(oldPositions, targetNodes);
    }
  }, [pastStates.length, undo, animateTransition]);

  const executeRedo = useCallback(() => {
    if (futureStates.length > 0) {
      const currentNodes = useCanvasStore.getState().nodes;
      const oldPositions = new Map(
        currentNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
      );
      redo();
      const targetNodes = [...useCanvasStore.getState().nodes];
      animateTransition(oldPositions, targetNodes);
    }
  }, [futureStates.length, redo, animateTransition]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        executeUndo();
      }
      if (
        (modifier && event.key.toLowerCase() === 'y') ||
        (modifier && event.key.toLowerCase() === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        executeRedo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [executeUndo, executeRedo]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchInfrastructure();
  }, [fetchInfrastructure]);

  if (isLoading && nodes.length === 0) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
          Parsing AWS Topology...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-screen bg-slate-50 overflow-hidden">
      <TopNav />
      <div className="flex-1 relative w-full h-full">
        <MetricsSidebar />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          defaultEdgeOptions={{ type: 'animatedEdge' }}
          onNodeClick={(event, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
        >
          <Background color="#cbd5e1" gap={20} size={2} />
          <Panel position="top-left" className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-sm border border-slate-200 flex gap-2">
            <Button variant="outline" onClick={executeUndo} disabled={pastStates.length === 0} className="font-bold text-slate-700">↩ Undo</Button>
            <Button variant="outline" onClick={executeRedo} disabled={futureStates.length === 0} className="font-bold text-slate-700">Redo ↪</Button>
          </Panel>
          <LensToolbar />
          {activeLens === 'cost' && (
            <div className="absolute bottom-8 left-8 z-40 ...">
              {/* Cost legend */}
            </div>
          )}
          {/* MiniMap commented out */}
        </ReactFlow>
      </div>
    </div>
  );
}
```

---

## 3. NODE REGISTRATION

**File:** [ArchitectureCanvas.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/ArchitectureCanvas.tsx) — Lines 44–53

```tsx
const nodeTypes = React.useMemo(() => ({
  lambdaNode:      LambdaNode,        // → src/components/nodes/LambdaNode.tsx
  s3Node:          S3Node,            // → src/components/nodes/S3Node.tsx
  databaseNode:    DatabaseNode,      // → src/components/nodes/DatabaseNode.tsx
  VPC:             VpcNode,           // → src/components/nodes/VpcNode.tsx
  IGW:             VpcNode,           // → src/components/nodes/VpcNode.tsx  (reused)
  Subnet:          SubnetNode,        // → src/components/nodes/SubnetNode.tsx
  apiGatewayNode:  ApiGatewayNode,    // → src/components/nodes/ApiGatewayNode.tsx
  sqsNode:         SqsNode,          // → src/components/nodes/SqsNode.tsx
}), []);
```

---

## 4. EDGE REGISTRATION

**File:** [ArchitectureCanvas.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/ArchitectureCanvas.tsx) — Line 55

```tsx
const edgeTypes = React.useMemo(() => ({ animatedEdge: AnimatedEdge }), []);
```

Single edge type: `animatedEdge` → [AnimatedEdge.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/AnimatedEdge.tsx)

---

## 5. LAYOUT ENGINE FILE

**File:** [layoutUtils.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/lib/layoutUtils.ts)

**611 lines.** Full contents already captured above in the read phase. Key exports:

| Export | Type | Purpose |
|---|---|---|
| `getSemanticLayout()` | `async function` | Main entry — builds ELK graph, calls `elk.layout()`, flattens results |
| `snapshotPositions()` | `function` | Snapshots current node positions into a Map |
| `buildPinnedSet()` | `function` | Converts array of IDs to a Set for pinned-node constraints |
| `LayoutLens` | `type` | `'structural' \| 'blast-radius' \| 'cost'` |
| `LayoutDirection` | `type` | `'RIGHT' \| 'DOWN' \| 'LEFT' \| 'UP'` |
| `SemanticLayoutOptions` | `interface` | Options bag for layout runs |
| `LayoutResult` | `interface` | `{ layoutedNodes, layoutedEdges }` |

**ELK singleton** created at line 99:
```tsx
const elk = new ELK();
```

**`elk.layout()` called** at line 555:
```tsx
layoutedGraph = await elk.layout(elkGraph);
```

---

## 6. ANIMATED EDGE FILE

**File:** [AnimatedEdge.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/AnimatedEdge.tsx)

```tsx
//AnimatedEdge.tsx
'use client';

import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  Position,
  type EdgeProps,
} from '@xyflow/react';

import { useCanvasStore } from '../../store/useCanvasStore';

export default function AnimatedEdge({
  id, source, target, style = {}, label, markerEnd, data,
}: EdgeProps) {

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const activeLens = useCanvasStore((state) => state.activeLens);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);

  const isBlastRadiusMode = activeLens === 'blast-radius' && selectedNodeId !== null;
  const isConnectedToSelected = source === selectedNodeId || target === selectedNodeId;
  const isDimmed = isBlastRadiusMode && !isConnectedToSelected;
  const currentOpacity = isDimmed ? 0.1 : 1;

  // Parse ELK Orthogonal Routing Points
  const elkPoints = data?.elkPoints as { x: number, y: number }[] | undefined;
  const elkSource = data?.elkSource as { x: number, y: number } | undefined;
  const elkTarget = data?.elkTarget as { x: number, y: number } | undefined;

  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  // If ELK generated a smart path, use it!
  if (elkPoints && elkSource && elkTarget) {
    edgePath = `M ${elkSource.x},${elkSource.y} `;
    elkPoints.forEach((point) => {
      edgePath += `L ${point.x},${point.y} `;
    });
    edgePath += `L ${elkTarget.x},${elkTarget.y}`;

    if (elkPoints.length > 0) {
      const midPoint = elkPoints[Math.floor(elkPoints.length / 2)];
      labelX = midPoint.x;
      labelY = midPoint.y;
    } else {
      labelX = (elkSource.x + elkTarget.x) / 2;
      labelY = (elkSource.y + elkTarget.y) / 2;
    }
  }
  // FALLBACK: Bezier curve math
  else {
    if (!sourceNode || !targetNode) return null;

    const sWidth = sourceNode.measured?.width || 200;
    const sHeight = sourceNode.measured?.height || 100;
    const sourceX = sourceNode.internals.positionAbsolute.x + sWidth / 2;
    const sourceY = sourceNode.internals.positionAbsolute.y + sHeight / 2;

    const tWidth = targetNode.measured?.width || 200;
    const tHeight = targetNode.measured?.height || 100;
    const targetX = targetNode.internals.positionAbsolute.x + tWidth / 2;
    const targetY = targetNode.internals.positionAbsolute.y + tHeight / 2;

    const dx = targetX - sourceX;
    const dy = targetY - sourceY;

    let sourcePos = Position.Right;
    let targetPos = Position.Left;
    let finalSourceX = sourceX;
    let finalSourceY = sourceY;
    let finalTargetX = targetX;
    let finalTargetY = targetY;

    if (Math.abs(dx) > Math.abs(dy)) {
      sourcePos = dx > 0 ? Position.Right : Position.Left;
      targetPos = dx > 0 ? Position.Left : Position.Right;
      finalSourceX += dx > 0 ? sWidth / 2 : -(sWidth / 2);
      finalTargetX += dx > 0 ? -(tWidth / 2) : tWidth / 2;
    } else {
      sourcePos = dy > 0 ? Position.Bottom : Position.Top;
      targetPos = dy > 0 ? Position.Top : Position.Bottom;
      finalSourceY += dy > 0 ? sHeight / 2 : -(sHeight / 2);
      finalTargetY += dy > 0 ? -(tHeight / 2) : tHeight / 2;
    }

    const [bezierPath, bLabelX, bLabelY] = getBezierPath({
      sourceX: finalSourceX, sourceY: finalSourceY, sourcePosition: sourcePos,
      targetX: finalTargetX, targetY: finalTargetY, targetPosition: targetPos,
    });

    edgePath = bezierPath;
    labelX = bLabelX;
    labelY = bLabelY;
  }

  // Semantic Telemetry Styling
  const lowerLabel = typeof label === 'string' ? label.toLowerCase() : '';
  let strokeColor = '#cbd5e1';
  let particleColor = '#94a3b8';
  let strokeDasharray = undefined;
  let duration = '3s';
  let particleRadius = 3;

  if (lowerLabel.includes('post') || lowerLabel.includes('http') || lowerLabel.includes('api')) {
    strokeColor = '#e2e8f0'; particleColor = '#06b6d4'; duration = '1.4s'; particleRadius = 3.5;
  } else if (lowerLabel.includes('trigger') || lowerLabel.includes('event')) {
    strokeColor = '#fed7aa'; particleColor = '#ea580c'; duration = '0.9s'; strokeDasharray = '4,4';
  } else if (lowerLabel.includes('read') || lowerLabel.includes('write') || lowerLabel.includes('state')) {
    strokeColor = '#dbeafe'; particleColor = '#2563eb'; duration = '2.4s'; particleRadius = 4;
  } else if (lowerLabel.includes('store') || lowerLabel.includes('asset') || lowerLabel.includes('s3')) {
    strokeColor = '#bbf7d0'; particleColor = '#16a34a'; duration = '4s'; strokeDasharray = '6,6';
  }

  if (activeLens === 'cost') {
    strokeColor = '#f1f5f9'; particleColor = '#cbd5e1'; duration = '4s';
  }

  return (
    <>
      <defs>
        <marker id={`arrow-${id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} fillOpacity={currentOpacity} className="transition-opacity duration-300" />
        </marker>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#arrow-${id})`}
        style={{
          ...style, stroke: strokeColor, strokeWidth: 2, strokeDasharray,
          opacity: currentOpacity, transition: 'stroke 0.3s, stroke-width 0.3s, opacity 0.3s',
          fill: 'none',
        }}
      />

      <circle r={particleRadius} fill={particleColor} style={{ opacity: currentOpacity }} className="blur-[0.5px] transition-opacity duration-300">
        <animateMotion dur={duration} repeatCount="indefinite" path={edgePath} />
      </circle>

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 20}px)`,
              pointerEvents: isDimmed ? 'none' : 'auto',
              color: particleColor, borderColor: strokeColor,
              boxShadow: `0 4px 12px -4px ${strokeColor}`,
              zIndex: 100, opacity: currentOpacity,
            }}
            className="nodrag nopan bg-white/95 backdrop-blur-xl px-3 py-1 rounded-full border-2 text-[10px] font-black shadow-sm uppercase tracking-widest transition-all duration-300"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
```

---

## 7. DATA SOURCE

### 7a. Primary data source (runtime): API route

**File:** [route.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/app/api/infrastructure/route.ts)

Returns hardcoded mock AWS architecture via `GET /api/infrastructure`. The response includes:
- 7 nodes (VPC, Subnet, API Gateway, SQS, Lambda, Database, S3)
- 4 edges (all type `animatedEdge`)
- Nodes in the API route have **no position or style** — intended for ELK to compute.
- API route nodes include `data.layoutRole` for ingress/egress sorting.

### 7b. Static fallback data (imported but not used at runtime)

**File:** [latestdata.json](file:///d:/1Bhargav/Intutive/nebula-lens/src/data/latestdata.json)

Imported in the store at line 17:
```tsx
import initialData from '../data/latestdata.json'
```

**⚠️ This import is dead code** — `initialData` is never referenced anywhere in the store body. The store initializes with `nodes: []` and `edges: []`, then fetches from the API.

The static file contains the **same 7 nodes + 4 edges** but WITH hardcoded `position` and `style` values (stale).

### 7c. Fetch/load code

In [useCanvasStore.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/store/useCanvasStore.ts) — Lines 91–109:

```tsx
fetchInfrastructure: async () => {
  set({ isLoading: true });
  try {
    const response = await fetch('/api/infrastructure');
    if (!response.ok) throw new Error('Failed to capture cloud layout topology');
    const data = await response.json();

    // Pass nodes through the fresh ELK layout with initial settings
    const { layoutedNodes, layoutedEdges } = await getSemanticLayout(
      data.nodes as Node[],
      data.edges as Edge[],
      { direction: 'RIGHT', lens: get().activeLens }
    );

    set({ nodes: layoutedNodes, edges: layoutedEdges, isLoading: false });
  } catch (error) {
    console.error("Hydration Error:", error);
    set({ isLoading: false });
  }
},
```

Called from [ArchitectureCanvas.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/ArchitectureCanvas.tsx) lines 198–200:
```tsx
useEffect(() => {
    fetchInfrastructure();
}, [fetchInfrastructure]);
```

---

## 8. CANVAS STORE

**File:** [useCanvasStore.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/store/useCanvasStore.ts)

```tsx
// src/store/useCanvasStore.ts
import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  Connection, Edge, EdgeChange, Node, NodeChange,
  addEdge, applyNodeChanges, applyEdgeChanges,
} from '@xyflow/react';

import initialData from '../data/latestdata.json'  // DEAD IMPORT — never used

import { getSemanticLayout, snapshotPositions, LayoutLens } from '../lib/layoutUtils';

type LensType = 'structural' | 'blast-radius' | 'cost';  // unused type alias

type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isLoading: boolean;
  setSelectedNodeId: (id: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  fetchInfrastructure: () => Promise<void>;
  activeLens: LayoutLens;
  setActiveLens: (lens: LayoutLens) => Promise<void>;
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;
};

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: [],
      edges: [],
      isLoading: false,
      selectedNodeId: null,
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

      onNodesChange: (changes: NodeChange[]) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
      },
      onEdgesChange: (changes: EdgeChange[]) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },
      onConnect: (connection: Connection) => {
        set({ edges: addEdge(connection, get().edges) });
      },

      activeLens: 'structural',
      setActiveLens: async (lens) => {
        set({ activeLens: lens, selectedNodeId: null });
        const currentNodes = get().nodes;
        const currentEdges = get().edges;
        const positionsSnapshot = snapshotPositions(currentNodes);
        const { layoutedNodes, layoutedEdges } = await getSemanticLayout(
          currentNodes, currentEdges,
          { direction: 'RIGHT', lens: lens, previousPositions: positionsSnapshot }
        );
        set({ nodes: layoutedNodes, edges: layoutedEdges });
      },

      focusedNodeId: null,
      setFocusedNodeId: (id) => set({ focusedNodeId: id }),

      fetchInfrastructure: async () => {
        set({ isLoading: true });
        try {
          const response = await fetch('/api/infrastructure');
          if (!response.ok) throw new Error('Failed to capture cloud layout topology');
          const data = await response.json();
          const { layoutedNodes, layoutedEdges } = await getSemanticLayout(
            data.nodes as Node[], data.edges as Edge[],
            { direction: 'RIGHT', lens: get().activeLens }
          );
          set({ nodes: layoutedNodes, edges: layoutedEdges, isLoading: false });
        } catch (error) {
          console.error("Hydration Error:", error);
          set({ isLoading: false });
        }
      },
    }),
    {
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
      handleSet: (originalHandleSet) => {
        let timeout: ReturnType<typeof setTimeout>;
        return (pastState, replace) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => { originalHandleSet(pastState, replace); }, 250);
        };
      },
    }
  )
);
```

**State shape:**
| Field | Type | Purpose |
|---|---|---|
| `nodes` | `Node[]` | All React Flow nodes |
| `edges` | `Edge[]` | All React Flow edges |
| `selectedNodeId` | `string \| null` | Currently clicked node |
| `isLoading` | `boolean` | API fetch in progress |
| `activeLens` | `LayoutLens` | Current view mode |
| `focusedNodeId` | `string \| null` | Declared but **never read** anywhere |

---

## 9. NODE COMPONENTS

### 9a. LambdaNode
**File:** [LambdaNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/LambdaNode.tsx) — 117 lines
- Uses `useLensVisuals(id)` for opacity/highlighting/heatmap
- Has `motion.div` wrapper with spring transitions
- Cost badge when `activeLens === 'cost'`
- Centered invisible Handle (target=Top, source=Bottom)
- Displays `data.name`, `data.type || 'Lambda'`, `data.insights`

### 9b. S3Node
**File:** [S3Node.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/S3Node.tsx) — 116 lines
- Same pattern as LambdaNode
- **Bug:** Default type label says `'Api Gateway'` (line 85) instead of `'S3'`
- Displays `data.publicAccess` and `data.metrics.totalSize`

### 9c. DatabaseNode
**File:** [DatabaseNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/DatabaseNode.tsx) — 121 lines
- Same pattern as LambdaNode
- Displays `data.status` and `data.insights` in indigo badges

### 9d. VpcNode
**File:** [VpcNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/VpcNode.tsx) — 41 lines
- Container node: `w-full h-full`, dashed violet border
- No cost badge, no metrics
- Absolute-positioned header pill with VPC label

### 9e. SubnetNode
**File:** [SubnetNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/SubnetNode.tsx) — 41 lines
- Container node: `w-full h-full`, dashed blue border
- Same pattern as VpcNode but blue color scheme

### 9f. ApiGatewayNode
**File:** [ApiGatewayNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/ApiGatewayNode.tsx) — 105 lines
- Same leaf-node pattern as LambdaNode
- Displays `data.insights`

### 9g. SqsNode
**File:** [SqsNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/SqsNode.tsx) — 108 lines
- Same leaf-node pattern as LambdaNode
- Displays `data.insights`

---

## 10. LAYOUT TRIGGER

### 10a. On initial data load

**File:** [useCanvasStore.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/store/useCanvasStore.ts) — Lines 99–103

```tsx
const { layoutedNodes, layoutedEdges } = await getSemanticLayout(
  data.nodes as Node[],
  data.edges as Edge[],
  { direction: 'RIGHT', lens: get().activeLens }
);
```

- **Trigger:** `fetchInfrastructure()` called from `useEffect` in ArchitectureCanvas on mount
- **Input:** Raw `data.nodes` and `data.edges` from the API response (no prior positions)
- **Output:** `set({ nodes: layoutedNodes, edges: layoutedEdges, isLoading: false })`

### 10b. On lens change

**File:** [useCanvasStore.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/store/useCanvasStore.ts) — Lines 75–84

```tsx
const { layoutedNodes, layoutedEdges } = await getSemanticLayout(
  currentNodes,
  currentEdges,
  {
    direction: 'RIGHT',
    lens: lens,
    previousPositions: positionsSnapshot,
  }
);
```

- **Trigger:** `setActiveLens(lens)` called from `LensToolbar.tsx` button click
- **Input:** Current store `nodes` and `edges`, with `snapshotPositions()` of current state
- **Output:** `set({ nodes: layoutedNodes, edges: layoutedEdges })`

### 10c. Inside getSemanticLayout (the actual elk.layout call)

**File:** [layoutUtils.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/lib/layoutUtils.ts) — Lines 553–559

```tsx
let layoutedGraph: ElkNode;
try {
  layoutedGraph = await elk.layout(elkGraph);
} catch (err) {
  console.error('[ELK] Layout failed — returning current positions as fallback:', err);
  return { layoutedNodes: nodes, layoutedEdges: edges };
}
```

---

## 11. CURRENT SYMPTOMS

Based on code analysis, the following issues exist:

### SYMPTOM 1: Nodes from API have no `position` — potential first-frame crash

The API route ([route.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/app/api/infrastructure/route.ts)) intentionally omits `position` from all nodes. These nodes are passed directly to `getSemanticLayout()` as `data.nodes as Node[]`. React Flow's `Node` type **requires** a `position` field. If `getSemanticLayout` fails or ELK errors out, the fallback returns the original nodes **without positions**, which would crash React Flow or render all nodes stacked at `(0,0)`.

### SYMPTOM 2: `latestdata.json` import is dead code with stale positions

[useCanvasStore.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/store/useCanvasStore.ts) line 17 imports `latestdata.json` as `initialData`, but it is never used. The store starts with `nodes: []`. If the API fetch fails, the canvas shows nothing. Meanwhile the static data has **hardcoded positions and styles** that would conflict with ELK layout if ever used.

### SYMPTOM 3: S3Node shows wrong default type label

[S3Node.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/S3Node.tsx) line 85:
```tsx
{data.type || 'Api Gateway'}
```
The fallback label says `'Api Gateway'` instead of `'S3'`. Since `data.type` is not set in the API response (the data object has `name`, `insights`, `metrics` but no `type` field), the S3 node renders with the header text **"Api Gateway"**.

### SYMPTOM 4: AnimatedEdge ignores `data.labelMidpoint` from ELK

The layout engine ([layoutUtils.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/lib/layoutUtils.ts)) computes `labelMidpoint` and stores it in `edge.data.labelMidpoint` (line 378). However, [AnimatedEdge.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/canvas/AnimatedEdge.tsx) **never reads `data.labelMidpoint`**. Instead, it computes its own label position from the middle bend-point or the geometric midpoint (lines 59–66). This means edge labels can float disconnected from the actual edge path, especially with orthogonal routing where the midpoint of the bend-points is not the longest segment's center.

### SYMPTOM 5: `IGW` node type registered but never emitted by data

The `nodeTypes` map includes `IGW: VpcNode` (line 49), but no node in the API response or in `latestdata.json` has `type: 'IGW'`. This is harmless but dead registration.

### SYMPTOM 6: `LensType` alias is defined but unused

[useCanvasStore.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/store/useCanvasStore.ts) line 22 defines `type LensType = ...` which is never used; the store uses the imported `LayoutLens` type from layoutUtils.

### SYMPTOM 7: `focusedNodeId` state is declared but never consumed

The store declares `focusedNodeId` and `setFocusedNodeId` but no component reads `focusedNodeId`. It's dead state.

### SYMPTOM 8: ELK edge routing points use absolute coordinates — potential mismatch with React Flow's relative coordinate system

In [layoutUtils.ts](file:///d:/1Bhargav/Intutive/nebula-lens/src/lib/layoutUtils.ts), `collectEdges()` (lines 340–352) accumulates absolute offsets as it walks the ELK tree, and `extractEdgePoints()` adds these offsets to produce absolute coordinates for `elkSource`, `elkTarget`, and `elkPoints`. However, the `AnimatedEdge` renderer renders these absolute coordinates directly into SVG path strings within React Flow's viewport. If React Flow's internal coordinate system (which uses relative parent coordinates) doesn't match the absolute coordinates produced by the ELK post-processing, edges may render in the wrong position relative to their source/target nodes — especially for edges that cross container (VPC/Subnet) boundaries.

### SYMPTOM 9: Container nodes (VPC, Subnet) have `w-full h-full` CSS but size is set by ELK via `style`

[VpcNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/VpcNode.tsx) and [SubnetNode.tsx](file:///d:/1Bhargav/Intutive/nebula-lens/src/components/nodes/SubnetNode.tsx) use `className="w-full h-full"`. The ELK layout engine sets explicit `width` and `height` on the node's `style` object in [flattenElkNodes](file:///d:/1Bhargav/Intutive/nebula-lens/src/lib/layoutUtils.ts#L490-L506). These two mechanisms should be compatible (the inline style takes precedence), but if ELK doesn't produce width/height for a container, `w-full h-full` will collapse to whatever React Flow's default is.
