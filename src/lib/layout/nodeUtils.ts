/**
 * src/lib/layout/nodeUtils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared node/edge utilities used across the canvas pipeline.
 *
 * Layout-specific functions (partitionNodes, layoutUnconnectedZone,
 * resolveRootNodeCollisions, sortNodesByParentOrder, getGroupNodeProps,
 * createUnconnectedZoneDivider) have been consolidated into gravityLayout.ts.
 *
 * Functions kept here are either:
 *   - Pre-processing guards (purgeGhostGroups, validateParentRefs)
 *   - Edge normalisation (normalizeEdges)
 *   - Diagnostics (detectStalePositions, validateParentAssignmentDepth)
 */

import { Node, Edge } from '@xyflow/react';

/**
 * purgeGhostGroups
 * ────────────────
 * Find all parentId references actually used by children and remove
 * empty group nodes that have no edges and no children.
 */
export function purgeGhostGroups(nodes: Node[], edges: Edge[]): Node[] {
  // Collect all parentId values that are actually referenced by child nodes
  const referencedParents = new Set(
    nodes
      .filter((n) => (n as any).parentId ?? (n as any).parentNode)
      .map((n) => (n as any).parentId ?? (n as any).parentNode)
  );

  // A group node is a ghost if it has no children AND no edges
  const ghostIds = new Set(
    nodes
      .filter((n) => {
        const isGroupType = n.type === 'group' || n.data?.isGroup === true;
        const hasNoChildren = !referencedParents.has(n.id);
        const hasNoEdges = !edges.some(
          (e) => e.source === n.id || e.target === n.id
        );
        return isGroupType && hasNoChildren && hasNoEdges;
      })
      .map((n) => n.id)
  );

  if (ghostIds.size > 0) {
    console.warn(
      `[GravityLens] Purging ${ghostIds.size} ghost group node(s):`,
      [...ghostIds]
    );
  }

  return nodes.filter((n) => !ghostIds.has(n.id));
}

/**
 * detectStalePositions
 * ────────────────────
 * Detects root nodes that were expected to move after layout but didn't.
 */
export function detectStalePositions(
  newNodes: Node[],
  prevNodes: Node[]
): string[] {
  const prevMap = new Map(prevNodes.map((n) => [n.id, n]));
  const stale: string[] = [];

  for (const node of newNodes) {
    const prev = prevMap.get(node.id);
    if (!prev) continue;

    const dx = Math.abs(node.position.x - prev.position.x);
    const dy = Math.abs(node.position.y - prev.position.y);
    const pid = (node as any).parentId ?? (node as any).parentNode;

    if (dx === 0 && dy === 0 && !pid) {
      stale.push(node.id);
    }
  }

  if (stale.length > 0) {
    console.warn('[GravityLens] Nodes with stale positions:', stale);
  }
  return stale;
}

/**
 * validateParentRefs
 * ──────────────────
 * Fix missing parent references by promoting nodes to root.
 * Call this immediately after receiving nodes from your API, before storing in React state.
 */
export function validateParentRefs(nodes: Node[]): Node[] {
  const ids = new Set(nodes.map((n) => n.id));
  const fixed: Node[] = [];

  for (const node of nodes) {
    const pid = (node as any).parentId ?? (node as any).parentNode;
    if (pid && !ids.has(pid)) {
      console.warn(
        `[GravityLens] Backend returned child before parent or ` +
          `parent missing entirely. ` +
          `child=${node.id} missingParent=${pid}`
      );
      // Promote to root — better to show node uncontained than to crash or hide it
      fixed.push({
        ...node,
        parentId: undefined,
        extent: undefined,
        position: node.position ?? { x: 0, y: 0 },
      } as Node);
    } else {
      fixed.push(node);
    }
  }

  return fixed;
}

/**
 * normalizeEdges
 * ──────────────
 * Applies edge styling overrides based on category or edgeType.
 */
export function normalizeEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => {
    const category = edge.data?.category as string | undefined;
    const edgeType = edge.data?.edgeType as string | undefined;

    if (category === 'iam_permission') {
      return {
        ...edge,
        type: 'straight',
        style: { ...edge.style, strokeDasharray: '5,4', opacity: 0.4 },
      };
    } else if (category === 'TRIGGERS' || edgeType === 'TRIGGERS') {
      return {
        ...edge,
        type: 'smoothstep',
        animated: false,
        style: { ...edge.style, stroke: '#E24B4A', strokeWidth: 1.5 },
      };
    } else if (
      category === 'SERVES_FROM' ||
      edgeType === 'SERVES_FROM' ||
      category === 'ORIGIN_FROM' ||
      edgeType === 'ORIGIN_FROM'
    ) {
      return {
        ...edge,
        type: 'smoothstep',
        style: { ...edge.style, stroke: '#1D9E75', strokeDasharray: '6,3' },
      };
    }

    return edge;
  });
}

/**
 * validateParentAssignmentDepth
 * ─────────────────────────────
 * Catch the common bug where EC2/RDS is assigned to VPC instead of its direct subnet parent.
 */
export function validateParentAssignmentDepth(nodes: Node[]) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const LEAF_TYPES = new Set([
    'ec2',
    'rds',
    'lambda',
    'ecs',
    'elasticache',
    'redshift',
  ]);

  const issues = [];

  for (const node of nodes) {
    if (!LEAF_TYPES.has(node.data?.resourceType as string)) continue;
    const pid = (node as any).parentId ?? (node as any).parentNode;
    if (!pid) continue;

    const parent = nodeMap.get(pid);
    if (!parent) continue;

    // EC2/RDS/Lambda should be parented to subnet, not VPC directly
    if (parent.data?.resourceType === 'vpc') {
      issues.push({
        nodeId: node.id,
        nodeName: node.data?.label,
        wrongParent: parent.id,
        resourceType: node.data?.resourceType,
      });
    }
  }

  if (issues.length > 0) {
    console.warn(
      '[GravityLens] Nodes assigned to VPC directly instead of subnet:',
      issues
    );
  }

  return issues;
}
