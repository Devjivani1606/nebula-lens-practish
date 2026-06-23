'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { scaleIn } from '../../lib/motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
import Icon from "../../../public/icons/aws-public-subnet.svg"
function SubnetNode({ id, data, selected, positionAbsoluteX }: { id: string; data: any; selected?: boolean; positionAbsoluteX?: number }) {
  const { opacity, isHighlighted, isDimmed } = useLensVisuals(id);
  return (
    <motion.div
      whileHover={{ 
        scale: 1.01,
        transition: { duration: 0.15, ease: "easeOut" }
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: opacity,
        boxShadow: (selected || isHighlighted)
          ? "0 0 0 3px rgba(124, 111, 247, 0.15)"
          : "0px 4px 12px rgba(0, 0, 0, 0.1)"
      }}
      transition={{
        duration: 0.5,
        delay: Math.max(0, ((positionAbsoluteX || 0) + 400) * 0.0004)
      }}
      className={`relative w-full h-full border-solid rounded-[10px] backdrop-blur-[8px] pointer-events-auto transition-colors duration-200 ${
        selected || isHighlighted
          ? 'bg-[rgba(14,165,233,0.05)] dark:bg-white/[0.06] border-[#7C6FF7] dark:border-indigo-400 border-[1px]'
          : 'bg-[rgba(14,165,233,0.01)] dark:bg-white/[0.03] border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.18)] dark:border-white/10 dark:hover:border-white/20 border-[0.5px]'
      } ${
        isDimmed ? 'pointer-events-none' : ''
      }`}
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>

      {/* Redesigned Architectural Header (Pinned to top-left) */}
      <div className="absolute top-0 left-0 bg-blue-100/80 dark:bg-blue-900/50 backdrop-blur-sm border-b-2 border-r-2 border-blue-200/50 dark:border-blue-800/50 rounded-tl-[10px] rounded-br-xl px-3 py-1.5 flex items-center gap-2 shadow-sm">
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#1D9E75' }} />
        <span className="text-[10px] font-medium tracking-[0.6px] uppercase text-[var(--gl-text-muted)]">Subnet</span>
        <span className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)] truncate max-w-[150px]" title={data?.name}>
          {data?.name || 'Subnet'}
        </span>
      </div>
    </motion.div>
  );
}

export default memo(SubnetNode);