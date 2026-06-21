import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
import NodeTooltip from '../ui/NodeTooltip';
import Icon from "../../../public/icons/amazon-secrets-manager.svg"
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from '../ui/separator';

const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

function SecretsManagerNode({ id, data, selected, positionAbsoluteX }: { id: string; data: any; selected?: boolean; positionAbsoluteX?: number }) {
  const { opacity, isHighlighted, isDimmed, heatmapColor, borderColor: lensBorderColor, shadowColor } = useLensVisuals(id);
  const activeLens = useCanvasStore((state) => state.activeLens);
  const cost = data.metrics?.estMonthlyCost;

  const activeShadow = shadowColor
    ? `0px 4px 12px ${shadowColor}`
    : "0px 4px 12px rgba(0, 0, 0, 0.1)";

  return (
    <NodeTooltip name={data.name} type={data.type || 'Secrets Manager'} metrics={data.metrics}>
    <motion.div
      whileHover={{ 
        scale: 1.02, 
        borderColor: (selected || isHighlighted) ? "#7C6FF7" : "rgba(255, 255, 255, 0.18)",
        transition: { duration: 0.15, ease: "easeOut" }
      }}
      whileTap={{ scale: 0.97 }}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: opacity,
        borderColor: (selected || isHighlighted) ? "#7C6FF7" : "rgba(255, 255, 255, 0.08)",
        borderWidth: (selected || isHighlighted) ? "1px" : "0.5px",
        boxShadow: (selected || isHighlighted)
          ? "0 0 0 3px rgba(124, 111, 247, 0.15)"
          : activeShadow
      }}
      transition={{ 
        ...springTransition, 
        delay: Math.max(0, ((positionAbsoluteX || 0) + 400) * 0.0004) 
      }}
      className={`relative min-w-[200px] rounded-[10px] backdrop-blur-[8px] bg-white/60 dark:bg-slate-900/80 p-4 border-solid text-slate-800 dark:text-slate-200 ${isDimmed ? 'pointer-events-none grayscale-[50%]' : ''}`}
    >
      {activeLens === 'cost' && cost !== undefined && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-3 -right-3 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg rounded-full px-3 py-1 flex items-center gap-1"
        >
          <span className="text-[10px] font-medium tracking-[0.6px] uppercase text-[var(--gl-text-muted)]">Est</span>
          <span className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)]">${cost}</span>
          <span className="text-[12px] font-normal text-[var(--gl-text-muted)]">/mo</span>
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
            alt="Secrets Manager"
            width={28}
            height={28}
            className="object-contain drop-shadow-sm"
          />
        </div>

        <div className="flex flex-col overflow-hidden">
          <h3 className="text-[10px] font-medium tracking-[0.6px] uppercase text-[var(--gl-text-muted)] truncate">
            {data.type || 'Secrets Manager'}
          </h3>
          <h2 className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)] truncate">
            {data.name}
          </h2>
        </div>
      </div>
      
      <Separator className="bg-slate-100 dark:bg-slate-800 my-1" />

      {data.insights && (
        <div className="mt-3 text-[12px] font-normal text-[var(--gl-text-muted)] bg-slate-100/50 dark:bg-slate-950/50 p-2 rounded-md border border-slate-200/50 dark:border-slate-800/50">
          {data.insights}
        </div>
      )}
    </motion.div>
    </NodeTooltip>
  );
}

export default memo(SecretsManagerNode);
