'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';

function SubnetNode({ id,data, selected }: { id: string; data: any; selected?: boolean }) {
  const { opacity, isHighlighted, isDimmed } = useLensVisuals(id);
  return (
    <motion.div
      // We remove the scale animation so the whole screen doesn't shake!
      animate={{
        opacity: opacity,
        // Smooth transition for the blue border and background on selection
        borderColor: (selected || isHighlighted) ? "rgba(59, 130, 246, 0.8)" : "rgba(59, 130, 246, 0.4)",
        backgroundColor: (selected || isHighlighted) ? "rgba(59, 130, 246, 0.05)" : "rgba(59, 130, 246, 0.01)",
      }}
      transition={{ duration: 0.2 }}
      // THE FIX: w-full h-full, dashed border, transparent background
      className="relative w-full h-full rounded-xl border-2 border-dashed pointer-events-auto"
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>

      {/* Redesigned Architectural Header (Pinned to top-left) */}
      <div className="absolute top-0 left-0 bg-blue-100/80 backdrop-blur-sm border-b-2 border-r-2 border-blue-200/50 rounded-tl-xl rounded-br-xl px-3 py-1.5 flex items-center gap-2 shadow-sm">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-xs font-extrabold tracking-wider text-blue-800 uppercase">Subnet</span>
        <span className="text-xs font-semibold text-blue-600 truncate max-w-[150px]" title={data?.name}>
          {data?.name || 'Subnet'}
        </span>
      </div>
    </motion.div>
  );
}

export default memo(SubnetNode);