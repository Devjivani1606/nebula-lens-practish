'use client';

import React from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function ContextualInspector() {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as Record<string, any> | undefined;

  // Format camelCase keys (e.g., "memoryUtilization" -> "Memory Utilization")
  const formatMetricLabel = (str: string) => {
    const spaced = str.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col shadow-xl transition-colors duration-300">

      {/* Header Area */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
        <h2 className="font-black text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          {selectedNode ? 'Resource Inspector' : 'Canvas Inspector'}
        </h2>
        {selectedNode && (
          <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dynamic Body Area */}
      <div className="flex-1 overflow-y-auto p-5 relative">
        <AnimatePresence mode="wait">
          {selectedNode && data ? (
            // 🟢 ACTIVE STATE: The Telemetry Drawer
            <motion.div
              key="selected"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <Badge variant="secondary" className="mb-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  {selectedNode.type?.replace('Node', '').toUpperCase() || 'RESOURCE'}
                </Badge>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {data.name || selectedNode.id}
                </h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                  {data.insights}
                </p>
              </div>

              {/* Telemetry Chart Placeholder (Next Step: Recharts!) */}
              <div className="w-full h-32 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center border-dashed group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider relative z-10">[ CPU Chart Placeholder ]</span>
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              {/* Real Metrics mapped from route.ts */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Live Telemetry</h4>
                <div className="grid grid-cols-2 gap-3">
                  {data.metrics && Object.entries(data.metrics).map(([key, value]) => (
                    <div key={key} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider truncate mb-1">
                        {formatMetricLabel(key)}
                      </p>
                      <p className="text-sm font-black text-slate-800 dark:text-slate-200 truncate">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            // ⚪ DEFAULT STATE: Empty Canvas Instruction
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <div className="w-8 h-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-sm" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Resource Selected</h4>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  Click on any node in the canvas to inspect its telemetry, properties, and configuration.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}