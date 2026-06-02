'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
import Icon from "../../../public/icons/amazon-virtual-private-cloud.svg"
function VpcNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { opacity, isHighlighted, isDimmed } = useLensVisuals(id);
  return (
    <motion.div
      // We remove the scale animation so the whole screen doesn't shake!
      animate={{
        opacity: opacity,
        // Smooth transition for the border and background on selection
        borderColor: (selected || isHighlighted) ? "rgba(139, 92, 246, 0.8)" : "rgba(139, 92, 246, 0.4)",
        backgroundColor: (selected || isHighlighted) ? "rgba(139, 92, 246, 0.05)" : "rgba(139, 92, 246, 0.01)",
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
      <div className="absolute top-0 left-0 bg-violet-100/80 backdrop-blur-sm border-b-2 border-r-2 border-violet-200/50 rounded-tl-xl rounded-br-xl px-3 py-1.5 flex items-center gap-2 shadow-sm">
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
        <span className="text-xs font-extrabold tracking-wider text-violet-800 uppercase">VPC</span>
        <span className="text-xs font-semibold text-violet-600 truncate max-w-[150px]" title={data?.name}>
          {data?.name || 'VPC'}
        </span>
      </div>
    </motion.div>
  );
}

export default memo(VpcNode);