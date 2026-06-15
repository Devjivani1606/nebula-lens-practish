/**
 * src/lib/layout/elkConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ELK layout option constants shared across the layout pipeline.
 *
 * All values are strings — ELK parses them internally.
 * Full option reference: https://eclipse.dev/elk/reference/options.html
 */

import type { ElkLayoutOptions } from './types';

// ─── Root graph layout options ────────────────────────────────────────────────

/**
 * Options placed on the ELK root node. These govern the overall layered layout
 * and are inherited by all child graphs unless they override specific options.
 */
export const ROOT_LAYOUT_OPTIONS: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110', // Updated from 80
  'elk.spacing.nodeNode': '40',
  'elk.spacing.edgeNode': '45', // Updated from 35
  'elk.layered.edgeLabels.placement': 'CENTER',
  'elk.spacing.edgeEdge': '30', // Updated from 15
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.edgeLabels.sideSelection': 'SMART',
  'elk.spacing.labelNode': '20', // Updated from 10
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

// ─── Container node layout options ───────────────────────────────────────────

/**
 * Options applied to every container node (VPC, AvailabilityZone, Subnet).
 */
export const CONTAINER_LAYOUT_OPTIONS: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '20', // Updated from 30
  'elk.layered.nodePlacement.strategy': 'SIMPLE', // For tighter leaf-only packing
  'elk.layered.compaction.postCompaction.strategy': 'LEFT', // Push children together
};
