'use client';

import React from 'react';
import { motion } from 'framer-motion';
import TopNav from './TopNav';
import { Atom } from '@phosphor-icons/react';

// Dummy node positions to mirror a typical layout
const skeletonNodes = [
  { id: '1', x: 100, y: 150, width: 220, type: 'source' },
  { id: '2', x: 400, y: 100, width: 200, type: 'service' },
  { id: '3', x: 400, y: 250, width: 240, type: 'service' },
  { id: '4', x: 750, y: 175, width: 200, type: 'database' },
];

// Dummy edge lines
const skeletonEdges = [
  { id: 'e1-2', path: 'M320,175 C360,175 360,125 400,125' },
  { id: 'e1-3', path: 'M320,175 C360,175 360,275 400,275' },
  { id: 'e2-4', path: 'M600,125 C675,125 675,195 750,195' },
  { id: 'e3-4', path: 'M640,275 C695,275 695,195 750,195' },
];

export default function CanvasSkeleton() {
  return (
    <div className="flex flex-col w-full h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <TopNav />
      <div className="flex-1 relative w-full h-full">
        {/* Mock React Flow Canvas Area */}
        <div className="flex-1 h-full relative pr-[320px] bg-slate-50 dark:bg-slate-950 overflow-hidden">

          {/* Background dots (simulated) */}
          <div
            className="absolute inset-0 opacity-20 dark:opacity-10 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, #94a3b8 1px, transparent 0)',
              backgroundSize: '20px 20px'
            }}
          />

          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none min-w-[1000px] min-h-[600px] transform scale-90 sm:scale-100">
            {/* SVG Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
              {skeletonEdges.map((edge) => (
                <motion.path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  strokeWidth={2}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }}
                />
              ))}
            </svg>

            {/* Skeleton Nodes */}
            {skeletonNodes.map((node, i) => (
              <motion.div
                key={node.id}
                className="absolute bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm border border-slate-200/50 dark:border-slate-800/50 rounded-xl p-4 shadow-sm"
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  zIndex: 10
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.1,
                  duration: 0.5,
                  repeat: Infinity,
                  repeatType: "reverse",
                  ease: "easeInOut"
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-200/50 dark:bg-slate-800/50 animate-pulse shrink-0" />
                  <div className="flex flex-col gap-2 w-full">
                    <div className="h-2 w-16 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-100/50 dark:border-slate-800/50 space-y-2">
                  <div className="flex justify-between">
                    <div className="h-2 w-12 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
                    <div className="h-2 w-8 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Mock UI Elements */}
          <div className="absolute top-4 left-4 p-2 w-32 h-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-64 h-12 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-full border border-slate-200 dark:border-slate-800 animate-pulse" />
        </div>

        {/* Mock Inspector Panel */}
        <div className="absolute top-0 right-0 h-full w-80 bg-white/60 dark:bg-slate-950/60 backdrop-blur-xl border-l border-slate-200/50 dark:border-slate-800/50 flex flex-col pointer-events-none">
           <div className="p-5 border-b border-slate-200/50 dark:border-slate-800/50">
             <div className="h-4 w-32 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
           </div>
           <div className="p-5 space-y-6">
             <div className="h-32 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-xl animate-pulse" />
             <div className="space-y-3">
               <div className="h-3 w-3/4 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
               <div className="h-3 w-1/2 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
               <div className="h-3 w-5/6 bg-slate-200/50 dark:bg-slate-800/50 rounded animate-pulse" />
             </div>
             <div className="h-40 w-full bg-slate-200/50 dark:bg-slate-800/50 rounded-xl animate-pulse" />
           </div>
        </div>

        {/*  UPGRADED: Apple-Style Loading Overlay */}
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/10 dark:bg-[#0A0A0A]/20 backdrop-blur-[4px]">

          <div className="relative flex flex-col items-center">
            {/* Glowing Backdrop */}
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute w-32 h-32 bg-indigo-500 rounded-full blur-[60px]"
            />

            {/* The Floating Glass Icon */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
              className="relative z-10 p-4 rounded-3xl bg-white/40 dark:bg-white/[0.05] border border-white/60 dark:border-white/[0.1] shadow-2xl backdrop-blur-xl mb-4"
            >
              <Atom weight="duotone" className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </motion.div>

            {/* Typographic Loading Text with Staggered Dots */}
            <div className="relative z-10 flex flex-col items-center gap-2 bg-white/60 dark:bg-[#0A0A0A]/60 px-6 py-2 rounded-full border border-slate-200 dark:border-white/[0.05] backdrop-blur-md shadow-lg">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                  Parsing AWS Topology
                </span>
                <div className="flex items-center gap-1">
                  <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                  <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                  <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }} className="w-1 h-1 rounded-full bg-indigo-500" />
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
