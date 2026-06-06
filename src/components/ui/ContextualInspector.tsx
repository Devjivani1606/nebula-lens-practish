'use client';

import React from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
// 🚀 NEW: Import Recharts components
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// A refined color palette for our dynamic charts
const CHART_COLORS = ['#38bdf8', '#34d399', '#f472b6', '#fbbf24'];

export default function ContextualInspector() {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as Record<string, any> | undefined;

  // Format camelCase keys
  const formatMetricLabel = (str: string) => {
    const spaced = str.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  // 🚀 NEW: Dynamically extract chart keys (e.g., ['cpu', 'memory'] or ['requests', 'latency'])
  const telemetryData = data?.telemetryData;
  const chartKeys = telemetryData?.[0] ? Object.keys(telemetryData[0]).filter(k => k !== 'time') : [];

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

              {/* 🚀 NEW: The Recharts Telemetry Graph */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Time-Series Telemetry</h4>

                {telemetryData && chartKeys.length > 0 ? (
                  <div className="w-full h-40">
                    <ResponsiveContainer width="100%" height={100}>
                      <AreaChart data={telemetryData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                        <defs>
                          {chartKeys.map((key, index) => (
                            <linearGradient key={key} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={CHART_COLORS[index % CHART_COLORS.length]} stopOpacity={0}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                        <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                          itemStyle={{ textTransform: 'capitalize' }}
                        />
                        {chartKeys.map((key, index) => (
                          <Area
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={CHART_COLORS[index % CHART_COLORS.length]}
                            fillOpacity={1}
                            fill={`url(#color${key})`}
                            strokeWidth={2}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="w-full h-32 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center border-dashed">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">No Telemetry Available</span>
                  </div>
                )}
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              {/* Resource Metadata (Tags) */}
              {data.tags && (
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resource Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.tags).map(([key, value]) => (
                      <span key={key} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] font-mono text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400">{key}:</span> {String(value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              {/* Live Metrics */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Instance Properties</h4>
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