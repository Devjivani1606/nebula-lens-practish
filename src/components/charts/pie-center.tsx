'use client';

import React, { useContext } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PieChartContext } from './pie-chart';

export interface PieCenterProps {
  prefix?: string;
}

export function PieCenter({ prefix = '' }: PieCenterProps) {
  const context = useContext(PieChartContext);

  if (!context) {
    throw new Error('PieCenter must be used within a PieChart component');
  }

  const { slices, hoveredIndex, totalValue } = context;

  // Determine what label and value to show
  const isHovered = hoveredIndex !== null && slices[hoveredIndex];
  const activeLabel = isHovered ? slices[hoveredIndex].label : 'TOTAL';
  const activeValue = isHovered ? slices[hoveredIndex].value : totalValue;

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
