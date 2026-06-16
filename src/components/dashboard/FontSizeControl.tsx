'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FontSizeSelector } from './FontSizeSelector';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFontScale } from '@/hooks/useFontScale';

export function FontSizeControl() {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { scale } = useFontScale();

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const scaleLabels: Record<string, string> = {
    compact: 'Compact',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    larger: 'Larger',
  };

  return (
    <div className="relative flex items-center" ref={popoverRef}>
      {/* Trigger Button */}
      <Tooltip>
        <TooltipTrigger 
          render={
            <button
              onClick={() => setIsOpen(!isOpen)}
              className={`flex items-center justify-center w-[44px] h-[32px] rounded-[6px] transition-colors duration-100 ${
                isOpen 
                  ? 'bg-[var(--accent)] text-[var(--foreground)]' 
                  : 'bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]'
              }`}
            />
          }
        >
          <span className="flex items-baseline leading-none tracking-tight">
            <span style={{ fontSize: '13px' }}>A</span>
            <span style={{ fontSize: '18px' }}>A</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Text Size: {scaleLabels[scale] || 'Small'}
        </TooltipContent>
      </Tooltip>

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ 
              scale: 0.96, 
              opacity: 0,
              transition: { duration: 0.13 } 
            }}
            transition={{
              duration: 0.18,
              ease: [0.25, 0.46, 0.45, 0.94], // Matching scaleIn ease
            }}
            style={{ originX: 1, originY: 0 }} // Top-right origin
            className="absolute top-[calc(100%+8px)] right-0 bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl shadow-xl overflow-hidden p-1.5 flex z-50 min-w-[300px]"
          >
            <div onClick={() => setTimeout(() => setIsOpen(false), 120)} className="w-full">
              <FontSizeSelector layoutIdPrefix="popover-font" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
