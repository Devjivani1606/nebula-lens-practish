'use client';

import React, { useMemo } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from 'framer-motion';
import { X, TrendingDown, AlertTriangle } from 'lucide-react';
// 🚀 NEW: Imported BarChart components for the FinOps view
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

const CHART_COLORS = ['#38bdf8', '#34d399', '#f472b6', '#fbbf24'];
const COST_COLORS = { Compute: '#3b82f6', Storage: '#10b981', Network: '#f59e0b', Base: '#6366f1' };

export default function ContextualInspector() {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);

  // 🚀 NEW: Pull activeLens from store to trigger the FinOps UI
  const activeLens = useCanvasStore((state) => state.activeLens);
  const isCostLens = activeLens === 'cost';

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as Record<string, any> | undefined;

  const formatMetricLabel = (str: string) => {
    const spaced = str.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  const telemetryData = data?.telemetryData;
  const chartKeys = telemetryData?.[0] ? Object.keys(telemetryData[0]).filter(k => k !== 'time') : [];



  // Comprehensive logic for all node types
  const costBreakdown = useMemo(() => {
    if (!data?.metrics?.estMonthlyCost) return [];
    const total = data.metrics.estMonthlyCost;
    let breakdown = {};

    switch (selectedNode?.type) {
      case 'databaseNode':
        breakdown = { Compute: total * 0.5, Storage: total * 0.35, Network: total * 0.15 };
        break;
      case 'lambdaNode':
        breakdown = { Compute: total * 0.8, Network: total * 0.2 };
        break;
      case 's3Node':
        breakdown = { Storage: total * 0.85, Network: total * 0.15 };
        break;
      case 'apiGatewayNode':
        // API Gateways are mostly request compute and outbound data transfer
        breakdown = { Compute: total * 0.65, Network: total * 0.35 };
        break;
      case 'sqsNode':
        // Queues are primarily base API polling requests and light payload transfer
        breakdown = { Base: total * 0.85, Network: total * 0.15 };
        break;
      case 'VPC':
      case 'Subnet':
        // Networking containers are purely base hourly costs and traffic
        breakdown = { Base: total * 0.4, Network: total * 0.6 };
        break;
      default:
        breakdown = { Base: total * 0.7, Network: total * 0.3 };
    }

    return [{ name: 'Monthly Spend', ...breakdown }];
  }, [data, selectedNode]);
  //  NEW: The FinOps "Right-Sizing" Recommendation Engine
  const finopsRecommendation = useMemo(() => {
    if (!selectedNode || !isCostLens) return null;

    if (selectedNode.id === 'lambda-processor') {
      return {
        issue: "Over-provisioned Memory",
        action: "Downgrade allocated memory from 1024MB to 512MB based on historical max usage of 480MB.",
        savings: "$160/mo",
        severity: "high"
      };
    }
    if (selectedNode.id === 'db-mongo-cluster') {
      return {
        issue: "Low CPU Utilization (24%)",
        action: "Downsize from Dedicated M10 to M5. Current IOPS do not justify the M10 tier.",
        savings: "$400/mo",
        severity: "medium"
      };
    }
    return null;
  }, [selectedNode, isCostLens]);

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col shadow-xl transition-colors duration-300">

      {/* Header Area */}
      <div className={`p-5 border-b transition-colors duration-300 flex justify-between items-center ${isCostLens ? 'bg-emerald-50/80 dark:bg-slate-900/80 border-emerald-100 dark:border-slate-800' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'}`}>
        <h2 className={`font-black text-xs uppercase tracking-widest ${isCostLens ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {selectedNode ? (isCostLens ? 'FinOps Inspector' : 'Resource Inspector') : 'Canvas Inspector'}
        </h2>
        {selectedNode && (
          <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-200 transition-colors">
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
                <Badge variant="secondary" className={`mb-2 ${isCostLens ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                  {selectedNode.type?.replace('Node', '').toUpperCase() || 'RESOURCE'}
                </Badge>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {data.name || selectedNode.id}
                </h3>
                {isCostLens && data.metrics?.estMonthlyCost ? (
                  <p className="text-3xl font-black text-emerald-500 mt-2">
                    ${data.metrics.estMonthlyCost}<span className="text-sm text-slate-500 font-medium">/mo</span>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                    {data.insights}
                  </p>
                )}
              </div>

              {/* 🚀 DYNAMIC CHART RENDERING */}
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  {isCostLens ? 'Financial Breakdown' : 'Time-Series Telemetry'}
                </h4>

                {isCostLens ? (
                  <div className="w-full h-48 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                  <ResponsiveContainer width="100%" height={160}>
                    {/* 🚀 FIX: Added bottom: 30 margin to push the bar away from the legend */}
                    <BarChart layout="vertical" data={costBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" hide />
                      <Tooltip
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(value) => `$${Number(value).toFixed(2)}`}
                      />
                      {/* 🚀 Ensure the legend renders nicely at the bottom */}
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} verticalAlign="bottom" />

                      {Object.keys(COST_COLORS).map(key => (
                        <Bar key={key} dataKey={key} stackId="a" fill={COST_COLORS[key as keyof typeof COST_COLORS]} radius={[0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                ) : (
                  /* THE STANDARD TELEMETRY AREA CHART */
                  telemetryData && chartKeys.length > 0 ? (
                    <div className="w-full h-40">
                      <ResponsiveContainer width="100%" height={160}>
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
                            <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={1} fill={`url(#color${key})`} strokeWidth={2} />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="w-full h-32 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center border-dashed">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">No Telemetry Available</span>
                    </div>
                  )
                )}
              </div>

              {/* 🚀 NEW: FINOPS RECOMMENDATION ENGINE UI */}
              {isCostLens && finopsRecommendation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border bg-emerald-50 dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110" />
                  <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Right-Sizing Suggestion
                  </h4>
                  <p className="text-sm font-medium text-slate-800 dark:text-white mb-1">{finopsRecommendation.action}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-orange-400" /> {finopsRecommendation.issue}
                    </span>
                    <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                      Save {finopsRecommendation.savings}
                    </span>
                  </div>
                </motion.div>
              )}

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              {/* Live Metrics / Properties */}
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
                <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  {isCostLens ? 'Select a node to view its financial breakdown and optimization opportunities.' : 'Click on any node in the canvas to inspect its telemetry and configuration.'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}