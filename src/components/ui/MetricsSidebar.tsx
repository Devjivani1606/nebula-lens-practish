'use client';

import React from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// 1. THE FIX: Define exactly what our Node Data looks like
interface CustomNodeData {
  name?: string;
  insights?: string;
  metrics?: Record<string, string | number>;
  [key: string]: any; // Catch-all for any other React Flow data
}

const sidebarSpring = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  mass: 0.8
} as const;

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.15 }
  }
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 350, damping: 25 } }
} as const;

export default function MetricsSidebar() {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const activeLens = useCanvasStore((state) => state.activeLens);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // 2. THE FIX: Safely check for container types with optional chaining
  const isContainer = selectedNode?.type?.toLowerCase().includes('vpc') ||
                      selectedNode?.type?.toLowerCase().includes('subnet');

  const isOpen = !!selectedNode && !isContainer && activeLens !== 'blast-radius';

  // 3. THE FIX: Cast the data to our strict TypeScript interface
  const data = selectedNode?.data as CustomNodeData | undefined;

  const formatMetricLabel = (str: string) => {
    const spaced = str.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) setSelectedNodeId(null); }}>
      <AnimatePresence>
        {isOpen && selectedNode && data && (
          <SheetPrimitive.Portal>
            <SheetPrimitive.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-sm"
                />
              }
            />

            <SheetPrimitive.Popup
              render={
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={sidebarSpring}
                  className="fixed inset-y-0 right-0 z-50 w-[400px] sm:w-[450px] bg-white/75 backdrop-blur-2xl border-l border-white/40 shadow-2xl flex flex-col"
                />
              }
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedNodeId(null)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 z-50"
              >
                <X className="w-4 h-4" />
              </Button>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="flex flex-col h-full p-6 pt-12 overflow-y-auto"
              >
                <motion.div variants={itemVariants}>
                  <div className="flex items-center justify-between mb-4">
                    <Badge variant="secondary" className="uppercase text-[10px] font-black tracking-widest text-indigo-600 bg-indigo-500/10 border-indigo-200/50 px-2 py-1 shadow-sm">
                      {/* Safe to use selectedNode.type because of the narrowing above */}
                      {selectedNode.type?.replace('Node', '') || 'RESOURCE'}
                    </Badge>
                    {data.insights?.includes('Warning') && (
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                        <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Action Required</span>
                      </div>
                    )}
                  </div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight block">
                    {data.name || "Unknown Resource"}
                  </h2>
                  <p className="text-sm font-medium text-slate-500 mt-2">
                    {data.insights || "No operational insights available."}
                  </p>
                </motion.div>

                <motion.div variants={itemVariants}>
                  <Separator className="my-6 bg-slate-200/50" />
                </motion.div>

                <motion.div variants={itemVariants} className="flex-1">
                  <h3 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">
                    Live Telemetry
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    {data.metrics ? (
                      Object.entries(data.metrics).map(([key, value]) => (
                        <motion.div
                          key={key}
                          variants={itemVariants}
                          // 1. THE FIX: Explicitly set the initial state using standard RGBA
                          initial={{ backgroundColor: "rgba(255, 255, 255, 0.5)" }}
                          // 2. THE FIX: Animate smoothly to solid RGBA on hover
                          whileHover={{ scale: 1.02, backgroundColor: "rgba(255, 255, 255, 1)" }}
                          // 3. THE FIX: Remove 'bg-white/50' from this className string
                          className="p-4 rounded-xl border border-white/60 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] transition-colors"
                        >
                          <p className="text-[11px] text-slate-500 font-bold mb-1 truncate uppercase tracking-wider">
                            {formatMetricLabel(key)}
                          </p>
                          <p className="text-base font-black text-slate-800 truncate" title={String(value)}>
                            {String(value)}
                          </p>
                        </motion.div>
                      ))
                    ) : (
                      <p className="text-sm font-medium text-slate-400 col-span-2">No telemetry data connected.</p>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            </SheetPrimitive.Popup>
          </SheetPrimitive.Portal>
        )}
      </AnimatePresence>
    </Sheet>
  );
}