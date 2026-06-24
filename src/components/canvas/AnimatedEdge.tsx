'use client';

import React, { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  Position,
  type EdgeProps,
} from '@xyflow/react';

import { useCanvasStore } from '../../store/useCanvasStore';
import { useBlastRadius } from '../../hooks/useBlastRadius';
import { useSecurityAudit } from '../../hooks/useSecurityAudit';

// ─── Phase 3C: Theme-aware dual-palette edge coloring (Option A) ──────────────
//
// Design contract:
//   - Both palettes share the SAME hue order at each index.
//     Index 0 is always "indigo", index 1 is always "emerald", etc.
//   - The hash maps a source node ID to a palette index — this index is
//     IDENTICAL across both themes, so a node that's "indigo" in dark mode
//     is also "indigo" (darker shade) in light mode. Color identity is stable.
//   - Dark theme  → light-vibrant shades (high luminance to pop on dark canvas)
//   - Light theme → dark-saturated shades (low luminance for contrast on white)
//
// Hue families (by index):
//   0: indigo   1: emerald   2: pink     3: amber    4: cyan
//   5: violet   6: orange    7: green    8: red      9: sky

/** Light-vibrant shades — legible on dark glassmorphic canvas (#0a0a0a..#1e1e2e). */
const DARK_PALETTE = [
  '#818CF8', // indigo-400
  '#34D399', // emerald-400
  '#F472B6', // pink-400
  '#FBBF24', // amber-400
  '#22D3EE', // cyan-400
  '#A78BFA', // violet-400
  '#FB923C', // orange-400
  '#4ADE80', // green-400
  '#F87171', // red-400
  '#38BDF8', // sky-400
];

/** Dark-saturated shades — legible on light canvas (#f8fafc..#ffffff). */
const LIGHT_PALETTE = [
  '#4338CA', // indigo-700
  '#059669', // emerald-600
  '#BE185D', // pink-700
  '#B45309', // amber-700
  '#0891B2', // cyan-600
  '#6D28D9', // violet-700
  '#C2410C', // orange-700
  '#15803D', // green-700
  '#B91C1C', // red-700
  '#0369A1', // sky-700
];

// Cache: `${sourceId}:${isDark}` → color.
// Keyed by theme so toggling dark/light immediately invalidates stale entries.
const edgeColorCache = new Map<string, string>();

/**
 * djb2 hash → palette index. Stable for the lifetime of the page.
 * The same sourceId always maps to the same palette index, guaranteeing that
 * a node's color identity is consistent across both themes.
 */
function hashToPaletteIndex(sourceId: string, paletteLength: number): number {
  let hash = 5381;
  for (let i = 0; i < sourceId.length; i++) {
    hash = ((hash << 5) + hash) + sourceId.charCodeAt(i);
    hash = hash & hash; // keep 32-bit
  }
  return Math.abs(hash) % paletteLength;
}

/**
 * Returns a theme-aware, stable color for any source node ID.
 * - Dark theme:  light-vibrant shade (pops on dark canvas)
 * - Light theme: dark-saturated shade (contrast on white canvas)
 * Same hue family across both themes — color identity is preserved.
 */
function getSourceColor(sourceId: string, isDark: boolean): string {
  const cacheKey = `${sourceId}:${isDark}`;
  if (edgeColorCache.has(cacheKey)) return edgeColorCache.get(cacheKey)!;

  const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
  const color = palette[hashToPaletteIndex(sourceId, palette.length)];
  edgeColorCache.set(cacheKey, color);
  return color;
}

export default function AnimatedEdge({
  id,
  source,
  target,
  style = {},
  label,
  markerEnd,
  data, // NEW: Added data prop to access our transferCost
  selected, // Destructure selected state
}: EdgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Theme detection for Option A dual-palette coloring.
  // resolvedTheme handles 'system' by resolving to the actual OS preference.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light'; // default to dark if unresolved (SSR)

  // Phase 3D: Read the globally hovered edge id from store for cross-edge dimming
  const hoveredEdgeId = useCanvasStore((state) => state.hoveredEdgeId);
  const setHoveredEdgeId = useCanvasStore((state) => state.setHoveredEdgeId);
  // Edges list needed for source lookup during hover (subscribed, no getState call)
  const allEdges = useCanvasStore((state) => state.edges);

  // 1. Hook into React Flow's internal state to watch node coordinates in real-time
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  // Pull the global lens state to determine visibility
  const activeLens = useCanvasStore((state) => state.activeLens);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);

  const { affectedNodeIds, affectedEdgesMap } = useBlastRadius(selectedNodeId);

  // NEW: Get the absolute latest live metrics from the source node
  const globalNodes = useCanvasStore((state) => state.nodes);
  const actualSourceNode = globalNodes.find(n => n.id === source);
  const liveTelemetry = actualSourceNode?.data?.telemetryData as any[];
  const currentTraffic = liveTelemetry ? liveTelemetry[liveTelemetry.length - 1] : null;

  const isSecurityLens = activeLens === 'security';
  const { vulnerableNodeIds } = useSecurityAudit();

  // Calculate if this specific edge should be dimmed
  // Check if BOTH the source and target are inside the blast radius path
  const isBlastRadiusMode = activeLens === 'blast-radius' && selectedNodeId !== null;
  const isInsideBlastRadius = (affectedNodeIds.has(source) || source === selectedNodeId) && (affectedNodeIds.has(target) || target === selectedNodeId);

  // If we are in blast radius mode, and this edge is NOT part of the failure path, dim it.
  const isDimmed = isBlastRadiusMode && !isInsideBlastRadius;
  let currentOpacity = isDimmed ? 0.1 : 1;
  const isConnectedToSelected = source === selectedNodeId || target === selectedNodeId;

  // Phase 3D: Structural lens hover traceability.
  // When another edge is being hovered, dim this one unless it shares the same source lambda.
  const isStructuralLens = activeLens === 'structural';
  const anotherEdgeHovered = hoveredEdgeId !== null && hoveredEdgeId !== id;
  const hoveredEdgeSource = anotherEdgeHovered
    ? allEdges.find(e => e.id === hoveredEdgeId)?.source ?? null
    : null;
  const sameSourceAsHovered = hoveredEdgeSource === source;
  if (isStructuralLens && anotherEdgeHovered && !isHovered && !sameSourceAsHovered) {
    currentOpacity = 0.08;
  }


  // If the nodes haven't rendered yet, don't draw the edge
  if (!sourceNode || !targetNode) return null;

  // 2. Calculate the exact center points of both nodes
  const sWidth = sourceNode.measured?.width || 200;
  const sHeight = sourceNode.measured?.height || 100;
  const sourceX = sourceNode.internals.positionAbsolute.x + sWidth / 2;
  const sourceY = sourceNode.internals.positionAbsolute.y + sHeight / 2;

  const tWidth = targetNode.measured?.width || 200;
  const tHeight = targetNode.measured?.height || 100;
  const targetX = targetNode.internals.positionAbsolute.x + tWidth / 2;
  const targetY = targetNode.internals.positionAbsolute.y + tHeight / 2;

  // 3. Determine the relative angle between the nodes
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  let sourcePos = Position.Right;
  let targetPos = Position.Left;

  // 4. Boundary Math: Move the connection point from the center to the outer edge of the node
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

  // 5. Generate the edge path (ELK orthogonal or fallback bezier)
  const elkBendPoints = data?.elkBendPoints as {x: number, y: number}[] | undefined;
  const elkLabelPosition = data?.elkLabelPosition as {x: number, y: number} | undefined;

  let edgePath = '';
  let labelX = 0;
  let labelY = 0;

  if (source === target) {
    // Fallback: Self-loop edges
    const [bezierPath, bLabelX, bLabelY] = getBezierPath({
      sourceX: finalSourceX,
      sourceY: finalSourceY,
      sourcePosition: sourcePos,
      targetX: finalTargetX,
      targetY: finalTargetY,
      targetPosition: targetPos,
    });
    edgePath = bezierPath;
    labelX = bLabelX;
    labelY = bLabelY;
  } else if (elkBendPoints && elkBendPoints.length >= 2) {
    const start = elkBendPoints[0];
    edgePath = `M ${start.x} ${start.y}`;
    for (let i = 1; i < elkBendPoints.length; i++) {
      edgePath += ` L ${elkBendPoints[i].x} ${elkBendPoints[i].y}`;
    }

    if (elkLabelPosition) {
      labelX = elkLabelPosition.x;
      labelY = elkLabelPosition.y;
    } else {
      const mid = Math.floor(elkBendPoints.length / 2);
      labelX = elkBendPoints[mid].x;
      labelY = elkBendPoints[mid].y;
    }
  } else {
    // Fallback to smooth curve if layout hasn't run yet
    const [bezierPath, bLabelX, bLabelY] = getBezierPath({
      sourceX: finalSourceX,
      sourceY: finalSourceY,
      sourcePosition: sourcePos,
      targetX: finalTargetX,
      targetY: finalTargetY,
      targetPosition: targetPos,
    });
    edgePath = bezierPath;
    labelX = bLabelX;
    labelY = bLabelY;
  }

  // 6. DEFAULT STRUCTURAL STYLING: Parse the semantic telemetry context
  const lowerLabel = typeof label === 'string' ? label.toLowerCase() : '';

  // Phase 3C: Assign a distinct, stable, THEME-AWARE color to every source node.
  // Dark theme  → light-vibrant shade (high luminance on dark canvas)
  // Light theme → dark-saturated shade (high contrast on white canvas)
  // Same hue family in both themes — color identity is preserved across toggles.
  const sourceColor = getSourceColor(source, isDark);


  let strokeColor = sourceColor;
  let particleColor = sourceColor;
  let strokeDasharray: string | undefined = '6, 4'; // Default dashed for all structural edges
  let duration = '3s';
  let particleRadius = 3;
  let edgeWidth = 1.5; // Slightly thicker by default so the color is visible
  let glowColor = 'transparent';
  let animationClass = 'animate-[dash-flow_3s_linear_infinite]';

  // Data flow edges — keep dashes, just ensure animation is applied
  if (lowerLabel.includes('post') || lowerLabel.includes('http') || lowerLabel.includes('api') ||
      lowerLabel.includes('trigger') || lowerLabel.includes('event') || lowerLabel.includes('read') ||
      lowerLabel.includes('write') || lowerLabel.includes('state') || lowerLabel.includes('store') ||
      lowerLabel.includes('asset') || lowerLabel.includes('s3') || lowerLabel.includes('invoke') ||
      lowerLabel.includes('send')) {
    // Source color is already set — just keep the dashes and animation active
    strokeDasharray = '6, 4';
    animationClass = 'animate-[dash-flow_3s_linear_infinite]';
  }


  // 🚀 NEW: The Dynamic Speed Multiplier Engine
    // We parse duration (e.g., "3s") to a number, adjust it based on traffic, and stick the "s" back on.
    let baseSeconds = parseFloat(duration);

    const isCostLens = activeLens === 'cost';

    if (currentTraffic && !isCostLens) {
      // Find the primary metric driving this node (requests, cpu, readOps, etc)
      const primaryMetricValue = Number(
        currentTraffic.requests ||
        currentTraffic.cpu ||
        currentTraffic.connections ||
        currentTraffic.readOps ||
        currentTraffic.messages || 50
      );

      // If traffic is heavily spiking, particles move twice as fast!
      if (primaryMetricValue > 800 || primaryMetricValue > 80) {
        baseSeconds = baseSeconds * 0.4;
        particleRadius = particleRadius * 1.5; // Swell the particle size under heavy load
        particleColor = '#ef4444'; // Flash red under load
      }
      // If traffic is dead, they move sluggishly
      else if (primaryMetricValue < 100 || primaryMetricValue < 20) {
        baseSeconds = baseSeconds * 1.8;
      }
    }

    // Reassign the modified duration back to the string React expects
    duration = `${baseSeconds}s`;

  // 7.  THE UPGRADE: Cost Topology Lens Overrides

  const transferCost = (data?.transferCost as number) || 0;

  if (isCostLens) {
    strokeDasharray = '6,6'; // Dash looks great for financial data pipes

    if (transferCost > 100) {
      strokeColor = '#ef4444'; // Red
      particleColor = '#f87171';
      edgeWidth = 4;           // Thicker pipeline
      glowColor = 'rgba(239, 68, 68, 0.6)';
      duration = '1.2s';       // Fast movement for critical alerts
    } else if (transferCost > 20) {
      strokeColor = '#f97316'; // Orange
      particleColor = '#fb923c';
      edgeWidth = 3;
      glowColor = 'rgba(249, 115, 22, 0.5)';
      duration = '2s';
    } else {
      strokeColor = '#10b981'; // Green
      particleColor = '#34d399';
      edgeWidth = 2;
      glowColor = 'rgba(16, 185, 129, 0.3)';
      duration = '3s';
    }
  }
  // 🚀 THE SEC-OPS UPGRADE: Cyber Security & Kill Chain Overrides
  if (isSecurityLens) {
    // KILL CHAIN: If a node is clicked, show the lateral movement paths
    if (selectedNodeId && isInsideBlastRadius) {
      strokeColor = '#E24B4A'; // Lateral movement / breach path
      particleColor = '#dc2626';
      edgeWidth = 2;
      glowColor = 'rgba(226, 75, 74, 0.6)';
      strokeDasharray = '6, 3';
      duration = '1s'; // Very fast attack propagation
      animationClass = 'animate-[lateral-breach_0.8s_linear_infinite]';
    }
    // COMPLIANCE: Highlight statically vulnerable connections
    else if (!selectedNodeId && (vulnerableNodeIds.has(source) || vulnerableNodeIds.has(target))) {
      strokeColor = '#BA7517'; // Amber warning
      particleColor = '#f59e0b';
      edgeWidth = 2;
      glowColor = 'rgba(186, 117, 23, 0.4)';
      strokeDasharray = '4,4';
      duration = '1.5s';
    }
    // Safe or unselected paths
    else {
      strokeColor = '#334155';
      particleColor = '#475569';
      currentOpacity = selectedNodeId ? 0.05 : 0.2; // Dim heavily if a breach is active
    }
  }

  return (
    <>
      <defs>
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} fillOpacity={currentOpacity} className="transition-opacity duration-300" />
        </marker>
      </defs>

      <g
        onMouseEnter={() => {
          setIsHovered(true);
          setHoveredEdgeId(id);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoveredEdgeId(null);
        }}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={`url(#arrow-${id})`}
          className={`gl-edge-path ${selected ? 'selected' : ''} ${animationClass}`}
          style={{
            ...style,
            stroke: strokeColor,
            strokeWidth: edgeWidth, // 🚀 Dynamic Thickness
            strokeDasharray,
            opacity: currentOpacity,
            animationDelay: isInsideBlastRadius && affectedEdgesMap.has(id) ? `${affectedEdgesMap.get(id)! * 80}ms` : '0ms',
            filter: isCostLens || glowColor !== 'transparent' ? `drop-shadow(0 0 8px ${glowColor})` : 'none', // 🚀 Neon Glow
          }}
        />

        <circle key={duration} r={particleRadius} fill={particleColor} style={{ opacity: currentOpacity }} className="blur-[0.5px] transition-opacity duration-300">
          <animateMotion
            dur={duration}
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      </g>

      {/* Renders the text label */}
      {(label || isCostLens) && (() => {
        const useElkPos = !!elkLabelPosition;
        // Simple deterministic offset based on edge ID to prevent label stacking
        const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const randVal = ((hash % 100) / 100) * 2 - 1; // range -1 to 1
        const offsetY = useElkPos ? 0 : -20 + (randVal * 25); // Scatter Y by +/- 25px
        const offsetX = useElkPos ? 0 : randVal * 20;         // Scatter X by +/- 20px

        const isEmphasized = isHovered || selected || isConnectedToSelected;

        return (
          <EdgeLabelRenderer>
            <div
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX + offsetX}px,${labelY + offsetY}px)`,
                pointerEvents: isDimmed ? 'none' : 'auto',
                color: isCostLens && transferCost > 100 ? '#ef4444' : particleColor,
                borderColor: strokeColor,
                boxShadow: `0 4px 12px -4px ${glowColor !== 'transparent' ? glowColor : strokeColor}`,
                zIndex: isEmphasized ? 101 : 100,
                opacity: isEmphasized ? 1 : 0.65 * currentOpacity,
                fontSize: isEmphasized ? '11px' : '9px',
                transitionDuration: '120ms',
              }}
            className={`nodrag nopan px-3 py-1 rounded-full border-2 font-medium shadow-sm uppercase tracking-widest transition-all ${
              isCostLens
                ? 'bg-white dark:bg-slate-950'
                : 'bg-white dark:bg-slate-900'
            }`}
          >
            {/*  Dynamic Label text based on active lens */}
            {isCostLens ? (
              <span className="flex items-center gap-1">
                {transferCost > 100 && <span className="animate-pulse text-red-500">⚠️</span>}
                ${transferCost} <span className="text-[8px] text-slate-500">/mo</span>
              </span>
            ) : (
              label
            )}
          </div>
        </EdgeLabelRenderer>
        );
      })()}
    </>
  );
}