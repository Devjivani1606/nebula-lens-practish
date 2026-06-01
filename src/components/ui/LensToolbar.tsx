'use client';

import React from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { motion } from 'framer-motion';
import { Network, Orbit, CircleDollarSign } from 'lucide-react';
import { Panel } from '@xyflow/react';

// Define our lenses with their corresponding icons
const lenses = [
  { id: 'structural', label: 'Structural', icon: Network },
  { id: 'blast-radius', label: 'Blast Radius', icon: Orbit },
  { id: 'cost', label: 'Cost Topology', icon: CircleDollarSign },
] as const;

export default function LensToolbar() {
  const activeLens = useCanvasStore((state) => state.activeLens);
  const setActiveLens = useCanvasStore((state) => state.setActiveLens);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);

  const handleLensChange = (lensId: any) => {
    setActiveLens(lensId);
    // Pro UX: When switching contexts, clear the current selection so the user
    // sees the fresh map from a bird's-eye view.
    setSelectedNodeId(null);
  };

  return (
    // 2. Use the native React Flow Panel and tell it to go dead center
    <Panel position="top-center" className="pointer-events-auto z-50 mt-4">
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
      >
        {/* The Premium Glassmorphism Shell */}
        <div className="flex items-center gap-1 p-1.5 bg-white/60 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-full">

          {lenses.map(({ id, label, icon: Icon }) => {
            const isActive = activeLens === id;

            return (
              <button
                key={id}
                onClick={() => handleLensChange(id)}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors duration-200
                  ${isActive ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'}
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-lens-pill"
                    className="absolute inset-0 bg-white rounded-full shadow-sm border border-indigo-100/40"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}

        </div>
      </motion.div>
    </Panel>
  );
}