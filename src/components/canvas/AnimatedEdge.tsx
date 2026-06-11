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
import { useBlastRadius } from '../../hooks/useBlastRadius';
import { useSecurityAudit } from '../../hooks/useSecurityAudit';
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

  // 5. Generate the smooth curve based on our dynamic math
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: finalSourceX,
    sourceY: finalSourceY,
    sourcePosition: sourcePos,
    targetX: finalTargetX,
    targetY: finalTargetY,
    targetPosition: targetPos,
  });

  // 6. DEFAULT STRUCTURAL STYLING: Parse the semantic telemetry context
  const lowerLabel = typeof label === 'string' ? label.toLowerCase() : '';

  let strokeColor = 'rgba(255,255,255,0.15)'; // Default
  let particleColor = '#94a3b8';
  let strokeDasharray: string | undefined = undefined;
  let duration = '3s';
  let particleRadius = 3;
  let edgeWidth = 1; // Default edge thickness
  let glowColor = 'transparent';
  let animationClass = '';

  // Data flow edges
  if (lowerLabel.includes('post') || lowerLabel.includes('http') || lowerLabel.includes('api') || lowerLabel.includes('trigger') || lowerLabel.includes('event') || lowerLabel.includes('read') || lowerLabel.includes('write') || lowerLabel.includes('state') || lowerLabel.includes('store') || lowerLabel.includes('asset') || lowerLabel.includes('s3')) {
    strokeColor = '#7C6FF7'; // Brand Accent
    particleColor = '#7C6FF7';
    edgeWidth = 1;
    strokeDasharray = '6, 6';
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

      {/* Renders the text label */}
      {(label || isCostLens) && (() => {
        // Simple deterministic offset based on edge ID to prevent label stacking
        const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const randVal = ((hash % 100) / 100) * 2 - 1; // range -1 to 1
        const offsetY = -20 + (randVal * 25); // Scatter Y by +/- 25px
        const offsetX = randVal * 20;         // Scatter X by +/- 20px

        return (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX + offsetX}px,${labelY + offsetY}px)`,
                pointerEvents: isDimmed ? 'none' : 'auto',
                color: isCostLens && transferCost > 100 ? '#ef4444' : particleColor,
                borderColor: strokeColor,
                boxShadow: `0 4px 12px -4px ${glowColor !== 'transparent' ? glowColor : strokeColor}`,
                zIndex: 100,
                opacity: currentOpacity,
              }}
            className={`nodrag nopan px-3 py-1 rounded-full border-2 text-[10px] font-medium shadow-sm uppercase tracking-widest transition-all duration-300 ${
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