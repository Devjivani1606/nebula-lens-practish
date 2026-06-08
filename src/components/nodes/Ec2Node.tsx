'use client';

import React, { memo } from 'react';
import Image from 'next/image';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from '../ui/separator';
import Icon from "../../../public/icons/amazon-ec2.svg";

const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

function Ec2Node({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const { opacity, isHighlighted, isDimmed, heatmapColor, borderColor: lensBorderColor, shadowColor } = useLensVisuals(id);
  const activeLens = useCanvasStore((state) => state.activeLens);
  const cost = data.metrics?.estMonthlyCost;

  const activeBorderColor = lensBorderColor
    ? lensBorderColor
    : (selected || isHighlighted ? "rgba(249, 115, 22, 0)" : "rgba(226, 232, 240, 0.5)");

  const activeShadow = shadowColor
    ? `0px 8px 24px -4px ${shadowColor}`
    : (selected || isHighlighted)
      ? "0px 0px 0px 2px #3b82f6, 0px 10px 25px -5px rgba(59, 130, 246, 0.4)"
      : "0px 2px 8px -2px rgba(0, 0, 0, 0.05), 0px 4px 12px -4px rgba(0, 0, 0, 0.05)";

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      animate={{
        opacity: opacity,
        borderColor: activeBorderColor,
        boxShadow: (selected || isHighlighted)
          ? "0px 0px 0px 2px #3b82f6, 0px 10px 25px -5px rgba(59, 130, 246, 0.4)"
          : activeShadow,
      }}
      transition={springTransition}
      className={`relative min-w-[200px] rounded-xl backdrop-blur-md bg-white/60 dark:bg-slate-900/80 p-4 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 ${isDimmed ? 'pointer-events-none grayscale-[50%]' : ''}`}
    >
      {activeLens === 'cost' && cost !== undefined && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-3 -right-3 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-full px-3 py-1 flex items-center gap-1"
        >
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est</span>
          <span className="text-sm font-black text-slate-800 dark:text-slate-200">${cost}</span>
          <span className="text-[10px] font-bold text-slate-500">/mo</span>
        </motion.div>
      )}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>

      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] flex items-center justify-center shrink-0">
          <Image
            src={Icon}
            alt="EC2 Instance"
            width={28}
            height={28}
            className="object-contain drop-shadow-sm"
          />
        </div>

        <div className="flex flex-col overflow-hidden">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
            {data.service?.toUpperCase() || 'EC2 INSTANCE'}
          </h3>
          <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 truncate">
            {data.name}
          </h2>
        </div>
      </div>
      
      <Separator className="bg-slate-100 dark:bg-slate-800 my-1" />

      {data.metrics?.instanceType && (
        <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 flex justify-between">
          <span>Type:</span>
          <span>{data.metrics.instanceType}</span>
        </div>
      )}
      {data.metrics?.state && (
        <div className="mt-1 flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/50 p-2 rounded-md border border-indigo-100 dark:border-indigo-900/50">
          <span className={`w-2 h-2 rounded-full ${data.metrics.state === 'running' ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`}></span>
          {data.metrics.state.toUpperCase()}
        </div>
      )}
      {data.insights && (
        <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-950/50 p-2 rounded-md border border-slate-200/50 dark:border-slate-800/50">
          {data.insights}
        </div>
      )}
    </motion.div>
  );
}

export default memo(Ec2Node);
