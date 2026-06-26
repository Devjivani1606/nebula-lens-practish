/**
 * src/lib/layout/gravityLayout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Gravity Lens Enterprise Auto Layout — complete rewrite.
 *
 * Pipeline (LEFT→RIGHT AWS-style data-flow diagram):
 *
 *   Phase 1 — Data preparation
 *     1.1  Filter IAM edges (structural edges only)
 *     1.2  Build node index
 *     1.3  Build parent→children map  (uses parentId — RF v12 API)
 *     1.4  Classify nodes into ELK bucket vs. unconnected grid bucket
 *
 *   Phase 2 — Build nested ELK graph
 *     2.1  Recursive toElkNode() builds compound-node hierarchy
 *     2.2  ELK edge list (both endpoints must be in ELK bucket)
 *     2.3  Root graph options (layered / RIGHT / ORTHOGONAL)
 *
 *   Phase 3 — Run ELK + apply results
 *     3.1  runElkWithTimeout() — 5 s guard, falls through to emergency grid
 *     3.2  applyElkPositions() — recursive, produces parent-relative RF coords
 *     3.3  applyElkResult()    — public wrapper
 *
 *   Phase 4 — Compute bounding box of main graph
 *
 *   Phase 5 — Position unconnected nodes to the RIGHT, add divider label
 *
 *   Phase 6 — Topological sort (parents before children) + compose final array
 *
 * Coordinate system note
 * ──────────────────────
 * ELK populates x/y relative to each node's parent in the ELK hierarchy.
 * React Flow with `parentId` also uses parent-relative coordinates.
 * Therefore the ELK x/y can be used DIRECTLY as RF `position` for child nodes.
 * For root nodes, ELK x/y is absolute — also used directly.
 *
 * Parent-relative correction is needed ONLY when a node whose parentId differs
 * from its ELK parent (orphan promotion). That is handled in applyElkPositions
 * via the absolute coordinate tracking.
 */

import ELK from 'elkjs/lib/elk.bundled';
import type { ElkNode as ELKNode } from 'elkjs/lib/elk-api';
import type { Node, Edge } from '@xyflow/react';

// ─── ELK singleton ────────────────────────────────────────────────────────────

const elk = new ELK();

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_LEAF_W = 220;
const DEFAULT_LEAF_H = 100;
const DEFAULT_CONTAINER_W = 320;
const DEFAULT_CONTAINER_H = 220;

// ─── Phase 1 — Data preparation ───────────────────────────────────────────────

/**
 * 1.3 Build parent→children map.
 * Uses `parentId` (React Flow v12) as the parent reference field.
 */
function buildChildrenOf(nodes: Node[]): Map<string, string[]> {
  const childrenOf = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const node of nodes) {
    const pid = (node as any).parentId ?? (node as any).parentNode;
    if (pid && childrenOf.has(pid)) {
      childrenOf.get(pid)!.push(node.id);
    }
  }
  return childrenOf;
}

/**
 * 1.4 Classify every node into exactly one bucket.
 *
 * elkNodes   — Buckets A + B + C + E: all nodes that should pass through ELK.
 * unconnected — Bucket D: isolated leaf nodes with no edges or connected
 *               descendants; positioned in a side grid, never sent to ELK.
 */
function classifyNodes(
  nodes: Node[],
  structuralEdges: Edge[],
  childrenOf: Map<string, string[]>,
): { elkNodes: Node[]; unconnected: Node[] } {
  const edgeNodeIds = new Set<string>([
    ...structuralEdges.map((e) => e.source),
    ...structuralEdges.map((e) => e.target),
  ]);

  function hasConnectedDescendant(
    nodeId: string,
    visited = new Set<string>(),
  ): boolean {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    if (edgeNodeIds.has(nodeId)) return true;
    return (childrenOf.get(nodeId) ?? []).some((childId) =>
      hasConnectedDescendant(childId, visited),
    );
  }

  function hasChildren(nodeId: string): boolean {
    return (childrenOf.get(nodeId) ?? []).length > 0;
  }

  const elkNodes: Node[] = [];
  const unconnected: Node[] = [];

  for (const node of nodes) {
    const isContainer = hasChildren(node.id);
    const isConnected = edgeNodeIds.has(node.id);
    const hasConnectedChild = hasConnectedDescendant(node.id);

    if (!isContainer && !isConnected && !hasConnectedChild) {
      unconnected.push(node);
    } else {
      elkNodes.push(node);
    }
  }

  return { elkNodes, unconnected };
}

// ─── Phase 2 — Build ELK graph ────────────────────────────────────────────────

/**
 * 2.1 Recursively build an ELK compound node from a React Flow node id.
 */
function toElkNode(
  nodeId: string,
  nodeIndex: Map<string, Node>,
  childrenOf: Map<string, string[]>,
): ELKNode {
  const node = nodeIndex.get(nodeId)!;
  const childIds = childrenOf.get(nodeId) ?? [];
  const children = childIds.map((cid) =>
    toElkNode(cid, nodeIndex, childrenOf),
  );
  const isContainer = children.length > 0;

  // Use measured dimensions when available (React Flow v12 sets node.measured)
  const measuredW = (node as any).measured?.width;
  const measuredH = (node as any).measured?.height;

  const width = measuredW ?? node.width ?? (isContainer ? DEFAULT_CONTAINER_W : DEFAULT_LEAF_W);
  const height = measuredH ?? node.height ?? (isContainer ? DEFAULT_CONTAINER_H : DEFAULT_LEAF_H);

  const layoutOptions: Record<string, string> = isContainer
    ? {
        'elk.padding': '[top=52,left=28,bottom=28,right=28]',
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      }
    : {};

  return {
    id: nodeId,
    width,
    height,
    children,
    layoutOptions,
  };
}

/**
 * 2.2–2.3 Build the complete ELK root graph from the elk-bucket nodes.
 * Edges where either endpoint is outside the elk-bucket are skipped.
 */
function buildElkGraph(
  elkNodes: Node[],
  structuralEdges: Edge[],
  nodeIndex: Map<string, Node>,
  childrenOf: Map<string, string[]>,
): ELKNode {
  const elkNodeIds = new Set(elkNodes.map((n) => n.id));

  // Only root-level nodes (no parent, or parent is not in elkNodes) form the
  // top-level children of the ELK root graph.
  const rootElkNodes = elkNodes
    .filter((n) => {
      const pid = (n as any).parentId ?? (n as any).parentNode;
      return !pid || !elkNodeIds.has(pid);
    })
    .map((n) => toElkNode(n.id, nodeIndex, childrenOf));

  // 2.2 Edges — both endpoints must be in the elk bucket
  const elkEdges = structuralEdges
    .filter((e) => elkNodeIds.has(e.source) && elkNodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    }));

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
      'elk.spacing.edgeNode': '50',
      'elk.spacing.edgeEdge': '25',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.semiInteractive': 'true',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.aspectRatio': '1.8',
      'elk.separateConnectedComponents': 'true',
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: rootElkNodes,
    edges: elkEdges,
  };
}

// ─── Phase 3 — Run ELK + apply results ───────────────────────────────────────

/**
 * 3.1 Run ELK with a timeout guard.
 * Throws on timeout — caller catches and falls back to emergency grid.
 */
async function runElkWithTimeout(
  graph: ELKNode,
  timeoutMs = 5000,
): Promise<ELKNode> {
  return Promise.race([
    elk.layout(graph),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ELK timeout')), timeoutMs),
    ),
  ]) as Promise<ELKNode>;
}

/**
 * 3.2 Recursively apply ELK output positions back to React Flow nodes.
 *
 * ELK outputs x/y relative to each node's PARENT in the ELK hierarchy.
 * React Flow with `parentId` also expects parent-relative positions.
 * So we can use ELK x/y directly as RF position — no offset subtraction needed
 * for properly nested nodes.
 *
 * We track absolute coordinates separately (parentAbsX/Y accumulate downward)
 * only to correctly re-root nodes whose parentId doesn't match ELK ancestry
 * (shouldn't happen in a clean graph, but guards against edge cases).
 */
function applyElkPositions(
  elkNode: ELKNode,
  rfNodeMap: Map<string, Node>,
  parentAbsX = 0,
  parentAbsY = 0,
): void {
  const absX = parentAbsX + (elkNode.x ?? 0);
  const absY = parentAbsY + (elkNode.y ?? 0);

  const rfNode = rfNodeMap.get(elkNode.id);
  if (rfNode) {
    const pid = (rfNode as any).parentId ?? (rfNode as any).parentNode;

    if (pid && rfNodeMap.has(pid)) {
      // Child node — ELK x/y is already relative to this node's parent
      rfNode.position = {
        x: elkNode.x ?? 0,
        y: elkNode.y ?? 0,
      };
    } else {
      // Root node — ELK x/y is absolute
      rfNode.position = { x: absX, y: absY };
    }

    // Propagate ELK-computed dimensions to the RF node
    if (elkNode.width) {
      rfNode.width = elkNode.width;
      rfNode.style = {
        ...rfNode.style,
        width: elkNode.width,
        height: elkNode.height,
      };
    }
    if (elkNode.height) {
      rfNode.height = elkNode.height;
    }
  }

  for (const child of elkNode.children ?? []) {
    applyElkPositions(child, rfNodeMap, absX, absY);
  }
}

/**
 * 3.3 Public wrapper — clones elkNodes, walks ELK result, returns positioned RF nodes.
 */
function applyElkResult(elkResult: ELKNode, elkNodes: Node[]): Node[] {
  const rfNodeMap = new Map<string, Node>(
    elkNodes.map((n) => [n.id, { ...n }]),
  );

  for (const elkNode of elkResult.children ?? []) {
    applyElkPositions(elkNode, rfNodeMap);
  }

  return [...rfNodeMap.values()];
}

// ─── Phase 4 — Bounding box ───────────────────────────────────────────────────

function computeBoundingBox(nodes: Node[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) return { x: 0, y: 0, width: 800, height: 600 };

  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  for (const node of nodes) {
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    const w = node.width ?? DEFAULT_LEAF_W;
    const h = node.height ?? DEFAULT_LEAF_H;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// ─── Phase 5 — Unconnected zone ───────────────────────────────────────────────

/**
 * Grid-place unconnected nodes to the RIGHT of the main graph.
 * They are always reachable by panning but never mixed into the layered graph.
 */
function positionUnconnectedNodes(
  unconnectedNodes: Node[],
  mainBBox: { x: number; y: number; width: number; height: number },
): Node[] {
  if (unconnectedNodes.length === 0) return [];

  const NODE_W = 185;
  const NODE_H = 85;
  const GAP_X = 20;
  const GAP_Y = 20;
  const MARGIN_FROM_MAIN = 200;

  const availableHeight = Math.max(mainBBox.height, 400);
  const rowsPerCol = Math.max(1, Math.floor(availableHeight / (NODE_H + GAP_Y)));

  const startX = mainBBox.x + mainBBox.width + MARGIN_FROM_MAIN;
  const startY = mainBBox.y;

  return unconnectedNodes.map((node, i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    return {
      ...node,
      // Detach from any parent — unconnected nodes live at root level
      parentId: undefined,
      extent: undefined,
      position: {
        x: startX + col * (NODE_W + GAP_X),
        y: startY + row * (NODE_H + GAP_Y),
      },
    };
  });
}

/**
 * Divider label node marking the boundary between the main graph and the
 * unconnected service grid.
 */
function createSideDivider(
  mainBBox: { x: number; y: number; width: number; height: number },
  count: number,
): Node | null {
  if (count === 0) return null;

  return {
    id: '__unconnected-label__',
    type: 'default',
    draggable: false,
    selectable: false,
    focusable: false,
    position: {
      x: mainBBox.x + mainBBox.width + 200,
      y: mainBBox.y - 36,
    },
    style: {
      background: 'transparent',
      border: 'none',
      fontSize: 11,
      color: 'var(--text-muted)',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
    },
    data: {
      label: `${count} unconnected service${count !== 1 ? 's' : ''}`,
    },
  };
}

// ─── Phase 6 — Sort + compose ─────────────────────────────────────────────────

/**
 * Topological sort: every parent node is emitted before all of its children.
 * Uses BFS from root nodes — required by React Flow for compound nodes.
 */
export function sortByParentFirst(nodes: Node[]): Node[] {
  const nodeMap = new Map<string, Node>(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, Node[]>(nodes.map((n) => [n.id, []]));
  const roots: Node[] = [];

  for (let node of nodes) {
    const pid = (node as any).parentId ?? (node as any).parentNode;
    if (pid && nodeMap.has(pid)) {
      childrenMap.get(pid)!.push(node);
    } else {
      if (pid && !nodeMap.has(pid)) {
        // Orphan — detach from missing parent so RF doesn't error
        console.warn(
          `[GravityLens] Orphaned child — parent not found: child=${node.id} parent=${pid}. Promoting to root.`,
        );
        node = { ...node, parentId: undefined, extent: undefined } as Node;
      }
      roots.push(node);
    }
  }

  const sorted: Node[] = [];
  const queue = [...roots];
  while (queue.length) {
    const node = queue.shift()!;
    sorted.push(node);
    queue.push(...(childrenMap.get(node.id) ?? []));
  }

  return sorted;
}

/**
 * Emergency fallback when ELK completely fails.
 * Places all nodes in a simple grid, strips parent relationships to avoid RF errors.
 */
export function emergencyGridFallback(nodes: Node[]): Node[] {
  const NODE_W = 185;
  const NODE_H = 85;
  const COLS = Math.ceil(Math.sqrt(nodes.length * 1.6));
  const GAP = 40;

  const positioned = nodes.map((node, i) => ({
    ...node,
    parentId: undefined,
    extent: undefined,
    position: {
      x: (i % COLS) * (NODE_W + GAP),
      y: Math.floor(i / COLS) * (NODE_H + GAP),
    },
  }));

  return sortByParentFirst(positioned);
}

// ─── Container detection ──────────────────────────────────────────────────────

/**
 * Returns true if a node is a container type that should be non-interactive
 * in the React Flow canvas (VPC, Subnet, AvailabilityZone, group).
 */
export function isContainerNode(node: Node, childrenOf: Map<string, string[]>): boolean {
  return (childrenOf.get(node.id) ?? []).length > 0;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * runGravityLayout
 * ─────────────────
 * Full layout pipeline. Returns the positioned node array and the original
 * edge array (edges are not mutated — callers use smoothstep via RF config).
 *
 * Throws nothing — any failure falls back to emergency grid layout.
 *
 * @param nodes  Current React Flow nodes from the canvas store.
 * @param edges  Current React Flow edges from the canvas store.
 * @returns      `{ nodes: Node[], edges: Edge[] }` with updated positions.
 */
export async function runGravityLayout(
  nodes: Node[],
  edges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Trivial cases
  if (nodes.length === 0) return { nodes, edges };
  if (nodes.length === 1) {
    return {
      nodes: [{ ...nodes[0], position: { x: 0, y: 0 } }],
      edges,
    };
  }

  try {
    // ── Phase 1 ────────────────────────────────────────────────────────────────

    // 1.1 Filter structural edges (IAM permission edges never influence layout)
    const structuralEdges = edges.filter(
      (e) => (e.data as any)?.category !== 'iam_permission',
    );

    // 1.2 Node index
    const nodeIndex = new Map<string, Node>(nodes.map((n) => [n.id, n]));

    // 1.3 Parent→children map
    const childrenOf = buildChildrenOf(nodes);

    // 1.4 Classify
    const { elkNodes, unconnected } = classifyNodes(
      nodes,
      structuralEdges,
      childrenOf,
    );

    // ── Phase 2 ────────────────────────────────────────────────────────────────

    const elkGraph = buildElkGraph(
      elkNodes,
      structuralEdges,
      nodeIndex,
      childrenOf,
    );

    // ── Phase 3 ────────────────────────────────────────────────────────────────

    const elkResult = await runElkWithTimeout(elkGraph);
    const layoutedNodes = applyElkResult(elkResult, elkNodes);

    // ── Phase 4 ────────────────────────────────────────────────────────────────

    const mainBBox = computeBoundingBox(layoutedNodes);

    // ── Phase 5 ────────────────────────────────────────────────────────────────

    const unconnectedPositioned = positionUnconnectedNodes(unconnected, mainBBox);
    const divider = createSideDivider(mainBBox, unconnected.length);

    // ── Phase 6 ────────────────────────────────────────────────────────────────

    // Apply container node group properties (non-draggable, non-selectable)
    const applyContainerProps = (node: Node): Node => {
      if (isContainerNode(node, childrenOf)) {
        return {
          ...node,
          type: node.type ?? 'group',
          draggable: false,
          selectable: false,
          focusable: false,
        };
      }
      return node;
    };

    const allNodes: Node[] = [
      ...layoutedNodes.map(applyContainerProps),
      ...unconnectedPositioned,
      ...(divider ? [divider as Node] : []),
    ];

    const sorted = sortByParentFirst(allNodes);

    return { nodes: sorted, edges };
  } catch (err) {
    console.error(
      '[GravityLens] Layout failed, using emergency grid:',
      err,
    );
    return {
      nodes: emergencyGridFallback(nodes),
      edges,
    };
  }
}
