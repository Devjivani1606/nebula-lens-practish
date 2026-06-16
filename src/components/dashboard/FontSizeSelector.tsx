'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useFontScale, FontScale } from '@/hooks/useFontScale';

interface FontSizeSelectorProps {
  layoutIdPrefix: string;
}

export function FontSizeSelector({ layoutIdPrefix }: FontSizeSelectorProps) {
  const { scale, setScale } = useFontScale();

  const scaleOptions: { id: FontScale; label: string; sublabel?: string; isDefault?: boolean; iconSize: string }[] = [
    { id: 'compact', label: 'Compact', sublabel: 'Dense', iconSize: '11px' },
    { id: 'small', label: 'Small', isDefault: true, iconSize: '14px' },
    { id: 'medium', label: 'Medium', iconSize: '17px' },
    { id: 'large', label: 'Large', iconSize: '20px' },
    { id: 'larger', label: 'Larger', iconSize: '23px' },
  ];

  return (
    <div className="flex gap-1">
      {scaleOptions.map((opt) => {
        const isActive = scale === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setScale(opt.id)}
            className="relative flex flex-col items-center justify-start pt-2 pb-4 w-[60px] h-[72px] rounded-lg hover:bg-[var(--gl-bg-muted)] transition-colors"
          >
            <span
              className={`font-semibold mb-1 transition-colors ${
                isActive ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
              }`}
              style={{ fontSize: opt.iconSize, lineHeight: 1 }}
            >
              A
            </span>
            <span
              className={`text-[10px] transition-colors ${
                isActive ? 'text-[var(--primary)] font-medium' : 'text-[var(--muted-foreground)]'
              }`}
            >
              {opt.label}
            </span>
            {opt.sublabel && (
               <span className="text-[9px] text-[var(--muted-foreground)] opacity-70">
                 {opt.sublabel}
               </span>
            )}
            {opt.isDefault && (
              <span className="text-[8px] font-bold text-indigo-500 bg-indigo-500/10 px-1 rounded uppercase tracking-wider mt-0.5">
                Default
              </span>
            )}
            
            {isActive && (
              <motion.div
                layoutId={`${layoutIdPrefix}-active`}
                className="absolute bottom-1 w-1 h-1 rounded-full bg-[var(--primary)]"
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
