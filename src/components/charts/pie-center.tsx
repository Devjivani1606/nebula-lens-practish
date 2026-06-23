import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePie } from './pie-context';

export interface PieCenterProps {
  prefix?: string;
}

export function PieCenter({ prefix = '' }: PieCenterProps) {
  const { data, hoveredIndex, totalValue } = usePie();

  // Determine what label and value to show
  const isHovered = hoveredIndex !== null && data[hoveredIndex];
  const activeLabel = isHovered ? data[hoveredIndex].label : 'TOTAL';
  const activeValue = isHovered ? data[hoveredIndex].value : totalValue;

  return (
    <div className="flex flex-col items-center justify-center text-center pointer-events-none select-none">
      <AnimatePresence mode="wait">
        <motion.span
          key={activeLabel}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          className="text-[9px] font-bold tracking-[0.8px] text-[var(--gl-text-muted)] uppercase mb-0.5"
        >
          {activeLabel}
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.span
          key={activeValue}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="text-lg font-bold font-mono tracking-tight text-[var(--gl-text-primary)]"
        >
          {prefix}{activeValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

PieCenter.displayName = 'PieCenter';
