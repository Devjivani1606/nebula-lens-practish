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

export default function AnimatedEdge({
  id,
  source,
  target,
  style = {},
  label,
  markerEnd,
}: EdgeProps) {
  // 1. Hook into React Flow's internal state to watch node coordinates in real-time
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

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

  // If the horizontal distance is greater than vertical, connect on the Left/Right sides
  if (Math.abs(dx) > Math.abs(dy)) {
    sourcePos = dx > 0 ? Position.Right : Position.Left;
    targetPos = dx > 0 ? Position.Left : Position.Right;

    finalSourceX += dx > 0 ? sWidth / 2 : -(sWidth / 2);
    finalTargetX += dx > 0 ? -(tWidth / 2) : tWidth / 2;
  }
  // If vertical distance is greater, connect on the Top/Bottom sides
  else {
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

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth: 2,
          strokeDasharray: '5, 5',
          animation: 'dashdraw 1s linear infinite',
        }}
        id={id}
      />

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'auto',
              color: style?.stroke || '#64748b',
            }}
            className="nodrag nopan bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/50 text-[10px] font-extrabold shadow-sm uppercase tracking-wider hover:scale-105 transition-transform cursor-pointer"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}