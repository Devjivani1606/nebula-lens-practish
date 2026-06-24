/**
 * src/lib/layout/elkConfig.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ELK layout option constants shared across the layout pipeline.
 *
 * All values are strings — ELK parses them internally.
 * Full option reference: https://eclipse.dev/elk/reference/options.html
 *
 * ── Optimization history ──────────────────────────────────────────────────────
 * v2 (Phase 1 fixes):
 *   - Replaced 'elk.layered.edgeLabels.placement': 'CENTER' → 'elk.edgeLabels.placement': 'TAIL'
 *     CENTER was forcing all splines to converge at one vertical column in the
 *     middle of the canvas, creating a visual "pinch point" / crossing wall.
 *     TAIL places labels near the source, distributing them along the whole edge.
 *   - Added 'elk.layered.crossingMinimization.semiInteractive': 'true'
 *     Allows ELK to use the model order of nodes as tie-breaking hints during
 *     the crossing minimization sweep, which reduces crossings when nodes have
 *     a natural ordering.
 *   - Added 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true'
 *     Forces ELK to respect the declared order of nodes (their index in the
 *     children array) as a hard constraint during layer assignment, so target
 *     nodes (S3/SQS) are vertically ordered to match source Lambda Y-positions.
 *   - Increased 'elk.spacing.edgeNode': '45' → kept; 'elk.spacing.edgeEdge': '15'
 *     Enforces > 12px visual separation between parallel splines (audit target).
 *   - Added 'elk.padding' for canvas breathing room on all sides.
 *   - Added post-compaction strategy to spread nodes across full vertical height.
 */

import type { ElkLayoutOptions } from './types';

// ─── Root graph layout options ────────────────────────────────────────────────

/**
 * Options placed on the ELK root node. These govern the overall layered layout
 * and are inherited by all child graphs unless they override specific options.
 *
 * Key decisions:
 *   - SPLINES routing:      Smooth bezier curves instead of jagged 90° bends.
 *                           Critical for fan-out graphs (Lambda → many S3s) where
 *                           ORTHOGONAL produces an unreadable crossing wall.
 *   - BRANDES_KOEPF:        Best-in-class node placement strategy — minimizes
 *                           total edge crossings during node placement.
 *   - LAYER_SWEEP:          Classic iterative crossing minimization.
 *   - forceNodeModelOrder:  Target nodes vertically ordered to match source order,
 *                           directly fixing the central crossing wall.
 *   - semiInteractive:      Uses model order as tie-breaker in sweep — cheaper
 *                           than fully interactive but more accurate.
 *   - TAIL label placement: Labels appear near the source, NOT at the center
 *                           crossing point. Eliminates the vertical label wall.
 *   - edgeEdge spacing '15': Enforces > 12px separation (benchmark target).
 *   - edgeNode spacing '25': Prevents splines from hugging node boundaries.
 *   - padding '[top=40...]': Canvas breathing room on all sides.
 *   - postCompaction EDGE_LENGTH: Expands nodes to use full vertical height.
 */
export const ROOT_LAYOUT_OPTIONS: ElkLayoutOptions = {
  // ── Core algorithm ──────────────────────────────────────────────────────────
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',

  // ── Crossing minimization — THE most impactful fix ──────────────────────────
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // Forces target nodes (S3/SQS) to be vertically ordered matching their
  // source Lambda positions, eliminating the central crossing wall:
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  // Use model order as a tie-breaker during sweep without full interactivity:
  'elk.layered.crossingMinimization.semiInteractive': 'true',

  // ── Node placement ──────────────────────────────────────────────────────────
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',

  // ── Edge routing ────────────────────────────────────────────────────────────
  'elk.edgeRouting': 'SPLINES',                              // Smooth bezier curves

  // ── Edge label placement ─────────────────────────────────────────────────────
  // CRITICAL FIX: Do NOT pass label dimensions to ELK edges.
  // When ELK knows label widths, it creates a virtual 'label column' in the center
  // of the graph and routes ALL splines through that single column — this is the
  // pinch point. Labels are rendered by AnimatedEdge in React instead.
  // The option below tells ELK to treat labels as zero-size for routing purposes.
  'elk.layered.edgeLabels.placement': 'TAIL',

  // ── Spacing ─────────────────────────────────────────────────────────────────
  'elk.layered.spacing.nodeNodeBetweenLayers': '150',        // Horizontal layer gap
  'elk.spacing.nodeNode': '80',                              // Vertical node separation
  'elk.spacing.edgeNode': '25',                              // Prevent splines hugging nodes
  'elk.spacing.edgeEdge': '15',                              // > 12px audit target for separation
  'elk.spacing.labelNode': '20',

  // ── Canvas padding (breathing room on all four sides) ───────────────────────
  'elk.padding': '[top=40, left=40, bottom=40, right=40]',

  // ── Layering & cycle breaking ────────────────────────────────────────────────
  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',

  // ── Post-layout compaction (spreads nodes to use full vertical canvas) ───────
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
  'elk.layered.compaction.postCompaction.constraints': 'QUADRATIC',

  // ── Additional quality options ───────────────────────────────────────────────
  'elk.layered.unnecessaryBendpoints': 'true',               // Cleaner spline waypoints
  'elk.layered.edgeLabels.sideSelection': 'SMART',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

// ─── Container node layout options ───────────────────────────────────────────

/**
 * Options applied to every container node (VPC, AvailabilityZone, Subnet).
 *
 * Uses LONGEST_PATH layering inside containers so children form a sensible
 * internal order that aligns with the main flow direction (RIGHT).
 */
export const CONTAINER_LAYOUT_OPTIONS: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '30',                              // More room for children inside containers
  'elk.layered.nodePlacement.strategy': 'SIMPLE',           // Tighter leaf-only packing
  'elk.layered.compaction.postCompaction.strategy': 'LEFT', // Push children together
  // Phase 3A: Treat VPC children as part of the main flow to prevent the VPC
  // compound block from being placed as a monolithic element that disrupts routing
  'elk.layered.layering.strategy': 'LONGEST_PATH',
};
