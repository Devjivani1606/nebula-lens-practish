/**
 * src/lib/layout/types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared TypeScript types for the ELK auto-layout pipeline.
 */

// ─── ELK primitive types ────────────────────────────────────────────────────

/** A key→value map of ELK layout options. */
export type ElkLayoutOptions = Record<string, string>;

/** A label that ELK uses to size and route edge labels. */
export interface ElkLabel {
  text: string;
  width: number;
  height: number;
}

/** A single ELK edge (may span nesting boundaries when hierarchyHandling is INCLUDE_CHILDREN). */
export interface ElkEdge {
  id: string;
  sources: [string];
  targets: [string];
  labels?: ElkLabel[];
}

/**
 * An ELK node (recursive).
 * - Root node:       id = 'root', no x/y/width/height, has layoutOptions + children + edges
 * - Container node:  vpc / az / subnet — has layoutOptions, no fixed width/height (ELK computes)
 * - Leaf node:       resource — has explicit width + height, no children
 */
export interface ElkNode {
  id: string;
  /** Absolute x position — populated by ELK after layout, undefined before. */
  x?: number;
  /** Absolute y position — populated by ELK after layout, undefined before. */
  y?: number;
  /** Fixed width for leaf nodes; omitted for containers so ELK can size them. */
  width?: number;
  /** Fixed height for leaf nodes; omitted for containers so ELK can size them. */
  height?: number;
  layoutOptions?: ElkLayoutOptions;
  children?: ElkNode[];
  /** Edges are placed on the ROOT node; ELK resolves hierarchy automatically. */
  edges?: ElkEdge[];
}

// ─── React Flow node type aliases ────────────────────────────────────────────

/**
 * Node type strings exactly as used in latestdata.json.
 *
 *   ASSUMPTION: Container types are PascalCase ("VPC", "AvailabilityZone", "Subnet").
 *     Resource types are camelCase + "Node" suffix (e.g. "lambdaNode", "sqsNode").
 *     Verify these values if node types change.
 */
export type ContainerNodeType = 'VPC' | 'AvailabilityZone' | 'Subnet';
export type ResourceNodeType =
  | 'apiGatewayNode'
  | 'lambdaNode'
  | 'sqsNode'
  | 'databaseNode'
  | 's3Node'
  | 'ec2Node'
  | 'cloudFrontNode'
  | 'dynamoDbNode'
  | string; // open-ended for future node types

export type CanvasNodeType = ContainerNodeType | ResourceNodeType;

// ─── Result shape returned to React Flow ─────────────────────────────────────

/**
 * After ELK runs, we map positions back to React Flow node format.
 * Only the fields mutated by layout are included; callers merge with originals.
 */
export interface LayoutedNode {
  id: string;
  position: { x: number; y: number };
  /** Width returned by ELK (leaf nodes: same as input; containers: computed). */
  width?: number;
  /** Height returned by ELK (leaf nodes: same as input; containers: computed). */
  height?: number;
}

/** Full result of a layout pass, ready to be merged back into the canvas store. */
export interface LayoutResult {
  nodes: LayoutedNode[];
  /** Edges are returned unchanged — ELK doesn't mutate source/target. */
  edges: import('@xyflow/react').Edge[];
}
