'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useFontScale, FontScale } from '@/hooks/useFontScale';

interface FontSizeSelectorProps {
  layoutIdPrefix: string;
}

export function FontSizeSelector({ layoutIdPrefix }: FontSizeSelectorProps) {
  const { scale, setScale } = useFontScale();

  const scaleOptions: { id: FontScale; label: string; iconSize: string }[] = [
    { id: 'small', label: 'Smaller', iconSize: '14px' },
    { id: 'medium', label: 'Medium', iconSize: '18px' },
    { id: 'large', label: 'Larger', iconSize: '22px' },
  ];

  return (
    <div className="flex gap-1">
      {scaleOptions.map((opt) => {
        const isActive = scale === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setScale(opt.id)}
            className="relative flex flex-col items-center justify-center w-[72px] h-[64px] rounded-lg hover:bg-[var(--gl-bg-muted)] transition-colors"
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
