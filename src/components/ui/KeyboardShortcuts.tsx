'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon, KeyboardIcon } from '@phosphor-icons/react';

const SHORTCUTS = [
  { keys: ['Ctrl', 'Z'], description: 'Undo last action' },
  { keys: ['Ctrl', 'Y'], description: 'Redo last action' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo (alternative)' },
  { keys: ['←', '→'], description: 'Navigate product tour' },
  { keys: ['Esc'], description: 'Close tour / modal' },
  { keys: ['?'], description: 'Toggle this shortcut panel' },
];

export default function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="kbd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[500] bg-slate-950/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="kbd-modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            className="fixed z-[501] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] bg-white/[0.97] dark:bg-slate-950/[0.97] backdrop-blur-2xl border border-slate-200/80 dark:border-slate-700/60 rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center">
                  <KeyboardIcon weight="duotone" className="w-4 h-4 text-indigo-500" />
                </div>
                <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">
                  Keyboard Shortcuts
                </h2>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <XIcon weight="bold" className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Shortcuts Grid */}
            <div className="px-5 pb-5 space-y-1.5">
              {SHORTCUTS.map((shortcut, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    {shortcut.description}
                  </span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, j) => (
                      <React.Fragment key={j}>
                        {j > 0 && <span className="text-[9px] text-slate-400 mx-0.5">+</span>}
                        <kbd className="min-w-[26px] h-6 px-1.5 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                          {key}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                Press <kbd className="px-1 py-0.5 text-[9px] bg-slate-200 dark:bg-slate-700 rounded mx-0.5">?</kbd> to toggle
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
