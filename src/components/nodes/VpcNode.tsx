'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { scaleIn } from '../../lib/motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
import Icon from "../../../public/icons/amazon-virtual-private-cloud.svg"
import { Tray } from '@phosphor-icons/react';
function VpcNode({ id, data, selected, positionAbsoluteX }: { id: string; data: any; selected?: boolean; positionAbsoluteX?: number }) {
  const { opacity, isHighlighted, isDimmed } = useLensVisuals(id);
  return (
    <motion.div
      whileHover={{ 
        scale: 1.01, 
        borderColor: (selected || isHighlighted) ? "#7C6FF7" : "rgba(124, 111, 247, 0.6)",
        transition: { duration: 0.15, ease: "easeOut" }
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: opacity,
        borderColor: (selected || isHighlighted) ? "#7C6FF7" : "rgba(124, 111, 247, 0.4)",
        borderWidth: "1px",
        borderStyle: "dashed",
        backgroundColor: (selected || isHighlighted)
          ? "rgba(14, 165, 233, 0.05)"
          : "rgba(14, 165, 233, 0.01)",
        boxShadow: (selected || isHighlighted)
          ? "0 0 0 3px rgba(124, 111, 247, 0.15)"
          : "none"
      }}
      transition={{ 
        duration: 0.5,
        delay: Math.max(0, ((positionAbsoluteX || 0) + 400) * 0.0004)
      }}
      className={`relative w-full h-full border-solid rounded-[10px] backdrop-blur-[8px] pointer-events-auto ${
        isDimmed ? 'pointer-events-none' : ''
      }`}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>

      <div className="absolute top-0 left-0 bg-violet-100/80 dark:bg-violet-900/50 backdrop-blur-sm border-b-2 border-r-2 border-violet-200/50 dark:border-violet-800/50 rounded-tl-[10px] rounded-br-xl px-3 py-1.5 flex items-center gap-2 shadow-sm">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#1D9E75' }} />
        <span className="text-[10px] font-medium tracking-[0.6px] uppercase text-[var(--gl-text-muted)]">VPC</span>
        <span className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)] truncate max-w-[150px]" title={data?.name}>
          {data?.name || 'VPC'}
        </span>
      </div>

      {data?.isEmpty && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-[var(--gl-text-muted)] gap-2 pointer-events-none"
        >
          <Tray className="w-4 h-4 opacity-50" />
          <span className="text-[11px] font-medium tracking-[0.5px]">No resources detected in this VPC</span>
        </motion.div>
      )}
    </motion.div>
  );
}

export default memo(VpcNode);