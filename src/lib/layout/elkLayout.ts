/**
 * src/lib/layout/elkLayout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React Flow → ELK hierarchical graph converter, layout runner, and position
 * applicator.
 *
 * Pipeline:
 *   convertToElkGraph()  →  ElkNode tree ready for ELK
 *   runLayout()          →  calls ELK, walks result, returns updated RF nodes
 *   applyLayout()        →  (internal) recursive position extractor
 *
 * ─── Coordinate system note ──────────────────────────────────────────────────
 * ELK outputs positions relative to each node's parent container.
 * React Flow with `parentId` ALSO uses parent-relative coordinates.
 * Therefore, ELK's x/y values can be passed directly to RF `position`
 * without any parent-offset arithmetic. Verified by inspecting both
 * ELK's layout output contract and RF's compound-node documentation.
 */

import ELK from 'elkjs/lib/elk.bundled';
import type {
  ElkNode as ELKNode,
  ElkExtendedEdge,
  ElkLabel as ELKLabel,
} from 'elkjs/lib/elk-api';
import type { Node, Edge } from '@xyflow/react';

import { ROOT_LAYOUT_OPTIONS, CONTAINER_LAYOUT_OPTIONS } from './elkConfig';
import type {
  ElkLayoutOptions,
  ContainerNodeType,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when `nodeType` indicates it is a grouping/container type. */
function isContainer(nodeType: string): boolean {
  const t = nodeType.toLowerCase();
  return t.includes('vpc') || t.includes('subnet') || t.includes('availabilityzone') || t.includes('igw');
}

/**
 * Default fallback dimensions for leaf/resource nodes whose React Flow
 * `measured` dimensions have not yet been set by the renderer.
 *
 * ASSUMPTION: 220×100 is a reasonable approximation for the custom node
 *     cards defined in this project. Adjust if card sizes change.
 */
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 100;



/**
 * Resolves the rendered size of a React Flow node.
 *
 * Priority (React Flow v12 compatible):
 *   1. node.measured?.width / height  — set by RF after first render
 *   2. node.width / height            — RF v11 legacy fields
 *   3. DEFAULT_NODE_WIDTH / HEIGHT    — static fallback
 *
 * ASSUMPTION: `node.measured` is the React Flow v12 field name.
 */
function getNodeDimensions(node: Node): { width: number; height: number } {
  const w = (node as any).measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
  const h = (node as any).measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;
  return { width: w, height: h };
}

/**
 * estimateTextWidth — simple pixel-width estimator for edge label text.
 * Uses ~7 px per character plus 16 px horizontal padding.
 */
export function estimateTextWidth(text: string): number {
  return text.length * 7 + 16;
}

// ─── Phase 2A: Model order assignment for target nodes ──────────────────────

/**
 * assignModelOrder
 * ────────────────
 * Assigns ELK model order hints to every node so that target nodes (S3/SQS)
 * are vertically sorted to match the Y-index of their primary Lambda source.
 *
 * This directly fixes the root cause of the central crossing wall:
 * "Target nodes not vertically ordered to match source Y-positions".
 *
 * ASSUMPTION: Lambda nodes are the primary sources. The first edge that points
 * to a given target determines its vertical grouping.
 *
 * @param nodes  React Flow nodes (NOT mutated — returns deep copies)
 * @param edges  React Flow edges
 * @returns      New node array with elk.layered.crossingMinimization.nodeOrder
 *               set on each node according to its primary source order.
 */
export function assignModelOrder(nodes: Node[], edges: Edge[]): Node[] {
  // Deep clone to avoid mutating original data (hard constraint)
  const clonedNodes: Node[] = nodes.map(n => ({ ...n, properties: { ...(n as any).properties } }));

  // Map: nodeId → primary source node id (first edge pointing to this target wins)
  const targetSourceMap = new Map<string, string>();
  for (const edge of edges) {
    if (!targetSourceMap.has(edge.target)) {
      targetSourceMap.set(edge.target, edge.source);
    }
  }

  // Container types that should NOT be used as ordering anchors
  const CONTAINER_TYPES = new Set(['VPC', 'AvailabilityZone', 'Subnet', 'IGW']);

  // Find all unique source nodes that have outgoing edges (excluding containers)
  // Sort by current Y position as the initial order hint.
  const sourceNodeIds = new Set<string>();
  for (const edge of edges) sourceNodeIds.add(edge.source);

  const sourceNodes = clonedNodes
    .filter(n => sourceNodeIds.has(n.id) && !CONTAINER_TYPES.has(n.type ?? ''))
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0));

  const sourceOrder = new Map<string, number>();
  sourceNodes.forEach((node, index) => sourceOrder.set(node.id, index));

  // Apply model order to all nodes:
  //   - Source nodes: ordered by their own Y index
  //   - Target nodes: ordered by their primary source's index
  //   - Containers / unconnected: large order so they sort stably to the end
  return clonedNodes.map(node => {
    let order: number;
    if (sourceOrder.has(node.id)) {
      order = (sourceOrder.get(node.id) ?? 99) * 10;
    } else if (CONTAINER_TYPES.has(node.type ?? '')) {
      order = 995; // Containers always last
    } else {
      const primarySource = targetSourceMap.get(node.id);
      order = primarySource !== undefined
        ? (sourceOrder.get(primarySource) ?? 99) * 10 + 5 // Targets cluster near their source
        : 990; // Unconnected target nodes at end
    }
    return {
      ...node,
      data: {
        ...node.data,
        _elkModelOrder: String(order),
      },
    };
  });
}

// ─── Phase 2B: Port-based edge distribution on Lambda nodes ───────────────────

/**
 * addPortsToFanOutNodes  (was: addPortsToLambdaNodes)
 * ──────────────────────
 * Distributes outgoing edges from ANY node that has ≥2 outgoing edges across
 * evenly-spaced EAST ports instead of routing all edges from a single center point.
 *
 * This applies to:
 *   - Lambda nodes (multiple S3/SQS/DB targets)
 *   - API Gateway nodes (fan-out to Lambda + SQS)
 *   - IAM Role nodes (fan-out to ECS + EKS + Lambda + Step Functions)
 *   - ECS, Step Functions, CloudFront, and any other multi-target source
 *
 * Nodes with only 1 outgoing edge are left unchanged (no benefit from porting).
 *
 * IMMUTABLE: Does not mutate the input — returns a new ELKNode tree.
 */
export function addPortsToFanOutNodes(elkGraph: import('elkjs/lib/elk-api').ElkNode): import('elkjs/lib/elk-api').ElkNode {
  // Build: sourceNodeId → outgoing edges (in declaration order)
  // Only include nodes with ≥2 outgoing edges — single-edge nodes don't need port distribution
  const outgoingEdgesMap = new Map<string, import('elkjs/lib/elk-api').ElkExtendedEdge[]>();

  if (elkGraph.edges) {
    for (const edge of elkGraph.edges) {
      const sourceId = edge.sources?.[0];
      if (!sourceId) continue;
      if (!outgoingEdgesMap.has(sourceId)) {
        outgoingEdgesMap.set(sourceId, []);
      }
      outgoingEdgesMap.get(sourceId)!.push(edge);
    }
  }

  // Filter to only nodes with 2+ outgoing edges
  for (const [id, edges] of outgoingEdgesMap) {
    if (edges.length < 2) outgoingEdgesMap.delete(id);
  }

  /**
   * Recursively patch fan-out nodes anywhere in the ELK tree.
   * Fan-out nodes may live inside VPC/AZ/Subnet containers.
   */
  function patchNode(node: import('elkjs/lib/elk-api').ElkNode): import('elkjs/lib/elk-api').ElkNode {
    // Recurse into children first (depth-first, non-mutating)
    const patchedChildren = node.children?.map(patchNode);

    // Only add ports to nodes that have 2+ outgoing edges
    const outgoing = outgoingEdgesMap.get(node.id);
    if (!outgoing || outgoing.length < 2) {
      return patchedChildren ? { ...node, children: patchedChildren } : node;
    }

    // Node dimensions (fall back to defaults if not yet set by RF)
    const nodeHeight = node.height ?? DEFAULT_NODE_HEIGHT;
    const portCount = outgoing.length;
    const portSpacing = nodeHeight / (portCount + 1);

    // Create evenly distributed EAST output ports
    const ports = outgoing.map((_edge, index) => ({
      id: `${node.id}-port-out-${index}`,
      x: node.width ?? DEFAULT_NODE_WIDTH,
      y: portSpacing * (index + 1),
      width: 0,
      height: 0,
      properties: {
        'port.side': 'EAST',
        'port.index': String(index),
      },
    }));

    return {
      ...node,
      ...(patchedChildren ? { children: patchedChildren } : {}),
      ports,
      layoutOptions: {
        ...node.layoutOptions,
        'portConstraints': 'FIXED_ORDER',
        'elk.portConstraints': 'FIXED_ORDER',
      },
    };
  }

  // Patch all fan-out nodes in the tree
  const patchedRoot: import('elkjs/lib/elk-api').ElkNode = {
    ...elkGraph,
    children: elkGraph.children?.map(patchNode),
  };

  // Rewrite edge sources to use port IDs for fan-out nodes
  // Build a per-source counter so each edge gets a unique port index
  const portCounters = new Map<string, number>();

  const patchedEdges = elkGraph.edges?.map(edge => {
    const sourceId = edge.sources?.[0];
    if (!sourceId || !outgoingEdgesMap.has(sourceId)) return edge;

    const idx = portCounters.get(sourceId) ?? 0;
    portCounters.set(sourceId, idx + 1);

    return {
      ...edge,
      sources: [`${sourceId}-port-out-${idx}`],
    };
  }) ?? [];

  return { ...patchedRoot, edges: patchedEdges };
}

// ─── Graph converter ──────────────────────────────────────────────────────────

/**
 * convertToElkGraph
 * ─────────────────
 * Transforms a flat React Flow node/edge list into a nested ELK graph tree.
 *
 * Hierarchy:
 *   root
 *   └─ VPC nodes          (parentId === null, type === "VPC")
 *      └─ AvailabilityZone (parentId → VPC id)
 *         └─ Subnet        (parentId → AZ id)
 *            └─ resource nodes (parentId → Subnet id)
 *   └─ unparented resource nodes (parentId === null, not a VPC)
 *
 * All edges are placed on the root node; ELK routes them across hierarchy
 * levels automatically when hierarchyHandling is INCLUDE_CHILDREN.
 *
 * @param nodes  React Flow nodes (flat, any order)
 * @param edges  React Flow edges
 * @param rootLayoutOptions  Merged layout options for the root node
 * @returns      ELKNode root ready to pass to elk.layout()
 */
export function convertToElkGraph(
  nodes: Node[],
  edges: Edge[],
  rootLayoutOptions: ElkLayoutOptions = ROOT_LAYOUT_OPTIONS
): ELKNode {
  // ── 1. Build parentId → children index ────────────────────────────────────
  const childrenOf = new Map<string | null, Node[]>();
  childrenOf.set(null, []);

  // Map to fast lookup for node existence
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const node of nodes) {
    let pid: string | null = (node as any).parentId ?? null;
    // If a node references a parentId that does not exist in the nodes list, treat it as root
    if (pid !== null && !nodeIds.has(pid)) {
      pid = null;
    }
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(node);
  }

  const table1 = nodes.map(n => {
    const shortId = n.id.split(/[:/]/).pop();
    const pid = (n as any).parentId;
    const parentShortId = pid ? pid.split(/[:/]/).pop() : '—';
    const childCount = nodes.filter(child => (child as any).parentId === n.id).length;
    return { shortId, type: n.type, parentShortId, childCount };
  });
  console.log('TABLE 1 — Input hierarchy');
  console.table(table1);

  // ── 2. Recursively convert RF node → ELK node ─────────────────────────────
  function buildElkNode(rfNode: Node, depth: number = 0): ELKNode {
    const childRfNodes = childrenOf.get(rfNode.id) ?? [];
    const isContainerNode = childRfNodes.length > 0;

    // Empty container case: structurally grouping but no children
    const typeStr = (rfNode.type || '').toLowerCase();
    const isGroupingType = typeStr.includes('vpc') || typeStr.includes('subnet') || typeStr.includes('availabilityzone') || typeStr.includes('igw');

    if (isContainerNode) {
      // Container: no fixed size (ELK computes from children + padding)
      const paddingTop = depth === 0 ? 60 : 40;
      const padding = `[top=${paddingTop},left=20,bottom=20,right=20]`;

      return {
        id: rfNode.id,
        layoutOptions: {
          ...(CONTAINER_LAYOUT_OPTIONS as Record<string, string>),
          'elk.padding': padding,
        },
        children: childRfNodes.map(child => buildElkNode(child, depth + 1)),
      };
    } else {
      // Leaf/resource: provide explicit dimensions
      let { width, height } = getNodeDimensions(rfNode);
      if (isGroupingType) {
        width = 280;
        height = 140;
      }
      // Phase 2A: Attach model order to ELK node layoutOptions so ELK's
      // crossing minimization sweep respects the declared vertical ordering.
      const modelOrder = (rfNode.data as any)?._elkModelOrder;
      const nodeLayoutOptions: Record<string, string> = {};
      if (modelOrder !== undefined) {
        nodeLayoutOptions['elk.layered.crossingMinimization.nodeOrder'] = modelOrder;
      }

      return {
        id: rfNode.id,
        width,
        height,
        ...(Object.keys(nodeLayoutOptions).length > 0 ? { layoutOptions: nodeLayoutOptions } : {}),
      };
    }
  }

  // ── 3. Root-level children (parentId === null) ─────────────────────────────
  const rootChildren: ELKNode[] = (childrenOf.get(null) ?? []).map(child => buildElkNode(child, 0));

  const elkRoot: ELKNode = {
    id: 'root',
    layoutOptions: rootLayoutOptions as Record<string, string>,
    children: rootChildren,
  };

  // ── 4. Collect all valid node IDs in the ELK tree ─────────────────────────
  const validElkIds = new Set<string>();
  function collectIds(n: ELKNode) {
    validElkIds.add(n.id);
    if (n.children) n.children.forEach(collectIds);
  }
  collectIds(elkRoot);

  // ── 5. Convert all RF edges → ElkExtendedEdge (flat on root) ──────────────
  const elkEdges: ElkExtendedEdge[] = [];
  for (const edge of edges) {
    if (!validElkIds.has(edge.source) || !validElkIds.has(edge.target)) {
      console.error(`[elkLayout] Skipping edge ${edge.id}: source (${edge.source}) or target (${edge.target}) not found in ELK graph.`);
      continue;
    }

    const labelText = typeof edge.label === 'string' ? edge.label : null;
    const elkEdge: ElkExtendedEdge = {
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    };

    if (labelText) {
      // PINCH FIX: Pass width=0, height=0 so ELK allocates NO physical space for labels.
      // When labels have real widths, ELK inserts a virtual 'label column' midway between
      // layers and routes ALL splines through it — creating the crossing pinch point.
      // Labels are rendered independently by AnimatedEdge in React Flow's EdgeLabelRenderer.
      elkEdge.labels = [{
        text: labelText,
        width: 0,
        height: 0,
      }];
    }
    elkEdges.push(elkEdge);
  }

  elkRoot.edges = elkEdges;

  return elkRoot;
}

// ─── Position extractor ───────────────────────────────────────────────────────

/**
 * Position data extracted from a single ELK output node.
 * Used internally by extractPositions().
 */
interface ElkPositionEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * extractPositions
 * ────────────────
 * Recursively walks the ELK output tree and builds a flat map of
 * nodeId → { x, y, width, height }.
 *
 * Coordinate system: ELK outputs positions relative to the direct parent
 * container, exactly matching React Flow's parentId compound-node system.
 * No offset adjustment is needed — ELK x/y === RF position.x/y. ✅
 *
 * @param elkNode  The positioned ELK node (root or any child)
 * @param out      Accumulator map (mutated in place for efficiency)
 */
function extractPositions(
  elkNode: ELKNode,
  out: Map<string, ElkPositionEntry>
): void {
  // Skip the synthetic root — it has no corresponding RF node
  if (elkNode.id !== 'root') {
    out.set(elkNode.id, {
      x: elkNode.x ?? 0,
      y: elkNode.y ?? 0,
      width: elkNode.width ?? DEFAULT_NODE_WIDTH,
      height: elkNode.height ?? DEFAULT_NODE_HEIGHT,
    });
  }

  for (const child of elkNode.children ?? []) {
    extractPositions(child, out);
  }
}

// ─── Layout runner ────────────────────────────────────────────────────────────

/**
 * runLayout
 * ─────────
 * Full layout pipeline:
 *   1. Convert RF nodes/edges → ELK graph  (convertToElkGraph)
 *   2. Run ELK layout engine               (elk.layout)
 *   3. Extract positions from ELK output   (extractPositions)
 *   4. Merge new positions into RF nodes   (immutable spread)
 *   5. Return updated nodes + pass-through edges
 *
 * Edges are passed through unchanged — Step 5 will handle edge geometry
 * (bend points, waypoints) using the section data from ELK's output.
 *
 * @param nodes  Current React Flow nodes from the canvas store
 * @param edges  Current React Flow edges from the canvas store
 * @returns      { nodes: updated RF nodes, edges: original RF edges }
 */
export async function runLayout(
  nodes: Node[],
  edges: Edge[]
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // ── Edge Case: Empty or single-node graph ──────────────────────────────────
  if (nodes.length <= 1) {
    return { nodes, edges };
  }

  // ── Step 1: Transformation pipeline (Phase 2) ─────────────────────────────
  // Order matters:
  //   assignModelOrder()   → annotates nodes with vertical-order hints
  //   convertToElkGraph()  → converts RF graph to ELK format (reads _elkModelOrder)
  //   addPortsToLambdaNodes() → distributes lambda fan-out edges to separate ports
  //   elk.layout()         → runs the layout engine
  const orderedNodes = assignModelOrder(nodes, edges);
  const elkGraph = convertToElkGraph(orderedNodes, edges, ROOT_LAYOUT_OPTIONS);
  const portedElkGraph = addPortsToFanOutNodes(elkGraph);


  // ── Step 2: Run ELK layout ────────────────────────────────────────────────
  // elk.bundled.js includes the layout engine inline (no Web Worker needed),
  // making it safe to instantiate per call in a Vite/Next.js bundler context.
  const elk = new ELK();
  const layoutResult = await elk.layout(portedElkGraph);

  const table2: any[] = [];
  function walkElk(node: ELKNode, depth: number, parentShortId: string) {
    const sId = node.id === 'root' ? 'root' : node.id.split(/[:/]/).pop();
    table2.push({
      shortId: sId,
      elkX: node.x,
      elkY: node.y,
      elkW: node.width,
      elkH: node.height,
      resultDepth: depth,
      resultParentShortId: parentShortId
    });
    node.children?.forEach(c => walkElk(c, depth + 1, sId!));
  }
  walkElk(layoutResult, 0, '—');
  console.log('TABLE 2 — ELK result tree');
  console.table(table2);

  // ── Step 3: Extract positions into a flat id→position map ─────────────────
  const positionMap = new Map<string, ElkPositionEntry>();
  extractPositions(layoutResult, positionMap);

  // ── Step 4: Merge ELK positions back into RF nodes ────────────────────────
  const updatedNodes: Node[] = nodes.map((node) => {
    const pos = positionMap.get(node.id);

    if (!pos) {
      // Node was not found in ELK output — return unchanged.
      // This should only happen for hidden/filtered nodes.
      console.warn(`[elkLayout] No ELK position found for node "${node.id}" — skipping.`);
      return node;
    }

    const childNodesCount = nodes.filter((n: any) => n.parentId === node.id).length;

    const updated: Node = {
      ...node,
      position: { x: pos.x, y: pos.y },
      data: {
        ...node.data,
        isEmpty: childNodesCount === 0
      }
    };

    // React Flow v12 strictness: extent="parent" can break rendering and push children
    // to the root canvas if the parent's dimensions aren't perfectly resolved in time.
    // Since ELK already guarantees children fit inside the parent, we can safely drop it.
    delete updated.extent;

    // Apply strict numeric dimensions to ALL nodes.
    // Container nodes get ELK's computed dimensions.
    // Resource nodes keep their original dimensions (which ELK used).
    const finalW = isContainer(node.type ?? '') ? pos.width : ((node as any).measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH);
    const finalH = isContainer(node.type ?? '') ? pos.height : ((node as any).measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT);

    updated.style = {
      ...node.style,
      width: finalW,
      height: finalH,
    };
    updated.width = finalW;
    updated.height = finalH;

    return updated;
  });


  // NOTE: Step 4.5 (disconnected-node shelf) intentionally REMOVED.
  // ELK's layered algorithm natively positions ALL nodes — including completely
  // isolated ones (no edges, no parentId). The previous shelf code was:
  //   1. Overriding ELK's correct positions with custom y = mainMaxY + 60,
  //      which pushed queue-worker to y=707 when ELK had already placed it at y=432.
  //   2. Inflating GRID_START_Y to ~1247 (VPC bottom 707 + 540 + 60), causing
  //      the minimap to render a massive empty canvas below the connected graph.
  // Removal was confirmed safe by running the ELK output diagnostic: every
  // root-level node (vpc, notifier, queue-worker, s3, sqs) already gets
  // correct x/y/width/height from ELK.




  // ── Step 5: Extract edge routes and label positions ───────────────────────
  const elkEdgesMap = new Map<string, ElkExtendedEdge>();
  if (layoutResult.edges) {
    for (const e of layoutResult.edges) {
      elkEdgesMap.set(e.id, e);
    }
  }

  const updatedEdges: Edge[] = edges.map((edge) => {
    const elkEdge = elkEdgesMap.get(edge.id);
    if (!elkEdge || !elkEdge.sections || elkEdge.sections.length === 0) {
      return edge;
    }

    const section = elkEdge.sections[0];

    // Convert to a flat array of waypoints: start -> bends -> end
    const waypoints = [
      { x: section.startPoint.x, y: section.startPoint.y },
      ...(section.bendPoints || []).map((bp) => ({ x: bp.x, y: bp.y })),
      { x: section.endPoint.x, y: section.endPoint.y }
    ];

    let elkLabelPosition = undefined;
    if (elkEdge.labels && elkEdge.labels.length > 0) {
      const label = elkEdge.labels[0];
      elkLabelPosition = { x: label.x ?? 0, y: label.y ?? 0 };
    }

    return {
      ...edge,
      data: {
        ...edge.data,
        elkBendPoints: waypoints,
        elkLabelPosition
      }
    };
  });

  const table3 = updatedNodes.map(n => ({
    shortId: n.id.split(/[:/]/).pop(),
    rfX: n.position.x,
    rfY: n.position.y,
    rfW: (n as any).style?.width,
    rfH: (n as any).style?.height,
    rfParentShortId: (n as any).parentId ? (n as any).parentId.split(/[:/]/).pop() : '—'
  }));
  console.log('TABLE 3 — Final React Flow nodes');
  console.table(table3);

  return { nodes: updatedNodes, edges: updatedEdges };
}
