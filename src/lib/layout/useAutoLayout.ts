/**
 * src/lib/layout/useAutoLayout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that wraps runLayout() with:
 *   - Loading state (isLayouting)
 *   - Node/edge count guard (don't re-run if nothing changed)
 *   - Depth map computation for staggered animation (returned to caller)
 *
 * This hook does NOT animate directly — it returns the new node positions
 * and a depth map so ArchitectureCanvas can drive animation via its existing
 * animateTransition() pattern, which is already integrated with the Zundo
 * temporal store (pause/resume for undo history).
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { runLayout } from './elkLayout';

// ─── Container type set (must match elkLayout.ts) ─────────────────────────────
const CONTAINER_TYPES = new Set(['VPC', 'AvailabilityZone', 'Subnet']);

/**
 * computeDepthMap
 * ───────────────
 * Walks the flat node list and assigns a hierarchy depth to each node:
 *   depth 0 → VPC (or any unparented root)
 *   depth 1 → AvailabilityZone
 *   depth 2 → Subnet
 *   depth 3 → resource nodes inside a Subnet
 *
 * Containers animate first (lower depth = lower delay), then their children.
 * This matches the requirement: VPC → AZ → Subnet → resources, staggered by
 * 30ms per depth level.
 */
export function computeDepthMap(nodes: Node[]): Map<string, number> {
  const parentOf = new Map<string, string | null>(
    nodes.map((n) => [n.id, (n as any).parentId ?? null])
  );

  const depthCache = new Map<string, number>();

  function getDepth(nodeId: string): number {
    if (depthCache.has(nodeId)) return depthCache.get(nodeId)!;
    const pid = parentOf.get(nodeId) ?? null;
    const depth = pid === null ? 0 : getDepth(pid) + 1;
    depthCache.set(nodeId, depth);
    return depth;
  }

  for (const node of nodes) {
    getDepth(node.id);
  }

  return depthCache;
}

/**
 * nodeEdgeHash
 * ────────────
 * Cheap fingerprint: concatenate node count + edge count + all node ids.
 * Good enough to detect add/remove without deep-diffing positions.
 * Does NOT detect position changes (intentional — layout should only
 * re-run on structure changes, not on every drag).
 */
function nodeEdgeHash(nodes: Node[], edges: Edge[]): string {
  return `${nodes.length}:${edges.length}:${nodes.map((n) => n.id).join(',')}`;
}

// ─── Hook return type ─────────────────────────────────────────────────────────

export interface AutoLayoutResult {
  /** True while ELK is computing. Use to show the loading spinner on the button. */
  isLayouting: boolean;
  /**
   * Call this to trigger a layout run.
   * Returns `{ nodes, depthMap }` on success, or `null` if layout was skipped
   * (e.g. already running) or failed.
   */
  triggerLayout: (
    nodes: Node[],
    edges: Edge[],
    options?: { force?: boolean }
  ) => Promise<{ nodes: Node[]; depthMap: Map<string, number> } | null>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAutoLayout(): AutoLayoutResult {
  const [isLayouting, setIsLayouting] = useState(false);
  const lastHashRef = useRef<string>('');
  const runningRef = useRef(false);

  const triggerLayout = useCallback(async (
    nodes: Node[],
    edges: Edge[],
    options: { force?: boolean } = {}
  ): Promise<{ nodes: Node[]; depthMap: Map<string, number> } | null> => {
    // Guard: don't stack concurrent layout runs
    if (runningRef.current) return null;

    // Guard: skip if structure hasn't changed (unless forced)
    const hash = nodeEdgeHash(nodes, edges);
    if (!options.force && hash === lastHashRef.current) return null;

    runningRef.current = true;
    setIsLayouting(true);

    try {
      const result = await runLayout(nodes, edges);
      lastHashRef.current = hash;

      // Compute depth map on the *original* nodes (parentId relationships
      // don't change during layout)
      const depthMap = computeDepthMap(nodes);

      return { nodes: result.nodes, depthMap };
    } catch (err) {
      console.error('[useAutoLayout] ELK layout failed:', err);
      return null;
    } finally {
      runningRef.current = false;
      setIsLayouting(false);
    }
  }, []);

  return { isLayouting, triggerLayout };
}
