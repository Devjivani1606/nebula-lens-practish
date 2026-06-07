'use client';

import React, { useMemo } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from 'framer-motion';
//  ADDED: Server and Zap icons from the old sidebar
import { X, TrendingDown, AlertTriangle, ShieldAlert, Activity, Server, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useBlastRadius } from '../../hooks/useBlastRadius';

const CHART_COLORS = ['#38bdf8', '#34d399', '#f472b6', '#fbbf24'];
// 🚀 Expand the colors to support deep networking metrics
const COST_COLORS = {
  Base: '#8b5cf6',
  Compute: '#3b82f6',
  Network: '#f59e0b',
  Storage: '#10b981',
  NATGateway: '#ec4899', // Pink for NAT
  EgressTraffic: '#ef4444', // Red for expensive internet traffic
  CrossAZ: '#f97316' // Orange for internal hops
};
//  BROUGHT OVER: The MetricCard helper from the old sidebar
function MetricCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30">
      <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mb-1 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-black text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

export default function ContextualInspector() {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  //  BROUGHT OVER: Edges required for global metrics
  const edges = useCanvasStore((state) => state.edges);

  const activeLens = useCanvasStore((state) => state.activeLens);
  const isCostLens = activeLens === 'cost';
  const isBlastRadiusLens = activeLens === 'blast-radius';

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as Record<string, any> | undefined;

  const { affectedNodes } = useBlastRadius(selectedNodeId);

  //  BROUGHT OVER: Global calculations for the empty state
  const resourceTypesCount = new Set(nodes.map(n => n.type)).size;
  const estimatedGlobalCost = useMemo(() => {
    return nodes.reduce((sum, node) => {
      const cost = (node.data as any)?.metrics?.estMonthlyCost;
      return sum + (Number(cost) || 0);
    }, 0);
  }, [nodes]);

  const formatMetricLabel = (str: string) => {
    const spaced = str.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  const telemetryData = data?.telemetryData;
  const chartKeys = telemetryData?.[0] ? Object.keys(telemetryData[0]).filter(k => k !== 'time') : [];

  const costBreakdown = useMemo(() => {
    if (!data?.metrics?.estMonthlyCost) return [];
    const total = data.metrics.estMonthlyCost;
    let breakdown = {};
    switch (selectedNode?.type) {
      case 'databaseNode': breakdown = { Compute: total * 0.5, Storage: total * 0.35, Network: total * 0.15 }; break;
      case 'lambdaNode': breakdown = { Compute: total * 0.8, Network: total * 0.2 }; break;
      case 's3Node': breakdown = { Storage: total * 0.85, Network: total * 0.15 }; break;
      case 'apiGatewayNode': breakdown = { Compute: total * 0.65, Network: total * 0.35 }; break;
      case 'sqsNode': breakdown = { Base: total * 0.85, Network: total * 0.15 }; break;
      case 'VPC':
      case 'Subnet':
        // Real-world VPC cost distribution
        breakdown = {
          NATGateway: total * 0.45,
          EgressTraffic: total * 0.35,
          CrossAZ: total * 0.15,
          Base: total * 0.05 // Minor things like public IPs or VPC endpoints
        };
        break;
      default: breakdown = { Base: total * 0.7, Network: total * 0.3 };
    }
    return [{ name: 'Monthly Spend', ...breakdown }];
  }, [data, selectedNode]);

  const finopsRecommendation = useMemo(() => {
    if (!selectedNode || !isCostLens) return null;
    if (selectedNode.id === 'lambda-processor') return { issue: "Over-provisioned Memory", action: "Downgrade allocated memory from 1024MB to 512MB.", savings: "$160/mo", severity: "high" };
    if (selectedNode.id === 'db-mongo-cluster') return { issue: "Low CPU Utilization (24%)", action: "Downsize from Dedicated M10 to M5.", savings: "$400/mo", severity: "medium" };
    if (selectedNode.type === 'VPC' || selectedNode.type === 'Subnet') {
      return {
        issue: "High NAT Gateway Data Processing",
        action: "Deploy VPC Gateway Endpoints for S3 and DynamoDB to route traffic internally and bypass NAT hourly/data charges.",
        savings: "$210/mo",
        severity: "medium"
      };
    }
    return null;
  }, [selectedNode, isCostLens]);


  // DYNAMIC HEADER COLOR LOGIC
  let headerBg = 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800';
  let headerText = 'text-slate-500 dark:text-slate-400';
  let panelTitle = 'Resource Inspector';

  if (selectedNode) {
    if (isCostLens) {
      headerBg = 'bg-emerald-50/80 dark:bg-slate-900/80 border-emerald-100 dark:border-slate-800';
      headerText = 'text-emerald-700 dark:text-emerald-400';
      panelTitle = 'FinOps Inspector';
    } else if (isBlastRadiusLens) {
      headerBg = 'bg-red-50/80 dark:bg-red-950/40 border-red-100 dark:border-red-900/50';
      headerText = 'text-red-600 dark:text-red-400';
      panelTitle = 'Impact Analysis Report';
    }
  } else {
    // 🚀 CHANGED: Title updates to Global Overview when nothing is selected
    panelTitle = 'Global Overview';
  }

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col shadow-xl transition-colors duration-300">

      {/* Dynamic Header */}
      <div className={`p-5 border-b transition-colors duration-300 flex justify-between items-center ${headerBg}`}>
        <h2 className={`font-black text-xs uppercase tracking-widest ${headerText}`}>
          {panelTitle}
        </h2>
        {selectedNode && (
          <button onClick={() => setSelectedNodeId(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 relative">
        <AnimatePresence mode="wait">
          {selectedNode && data ? (
            <motion.div key="selected" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-6">

              {/* Contextual Title Area */}
              <div>
                <Badge variant="secondary" className={`mb-2 ${
                  isCostLens ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                  isBlastRadiusLens ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30' :
                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>
                  {selectedNode.type?.replace('Node', '').toUpperCase() || 'RESOURCE'}
                </Badge>

                <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                  {data.name || selectedNode.id}
                </h3>

                {isCostLens && data.metrics?.estMonthlyCost ? (
                  <p className="text-3xl font-black text-emerald-500 mt-2">${data.metrics.estMonthlyCost}<span className="text-sm text-slate-500 font-medium">/mo</span></p>
                ) : isBlastRadiusLens ? (
                  <p className="text-sm font-bold text-red-500 mt-1 flex items-center gap-1">
                    <ShieldAlert className="w-4 h-4" /> Selected Failure Point
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{data.insights}</p>
                )}
              </div>

              {/* THE SRE IMPACT REPORT */}
              {isBlastRadiusLens ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="p-4 rounded-xl border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50">
                    <h4 className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Activity className="w-3 h-3" /> Cascading Failure
                    </h4>

                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Downstream Services Affected</span>
                      <span className="text-2xl font-black text-red-600 dark:text-red-400">{affectedNodes.length}</span>
                    </div>

                    <Separator className="bg-red-200 dark:bg-red-900/50 mb-4" />

                    <div className="space-y-2">
                      {affectedNodes.length > 0 ? affectedNodes.map(node => (
                        <div key={node.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-red-100 dark:border-red-900/30">
                           <AlertTriangle className="w-3 h-3 text-orange-500" />
                           <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                             {(node.data as any)?.name || node.id}
                           </span>
                        </div>
                      )) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">No downstream dependencies. Safe to isolate.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* KEEPING EXISTING RECHARTS COST/TELEMETRY LOGIC UNCHANGED */
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    {isCostLens ? 'Financial Breakdown' : 'Time-Series Telemetry'}
                  </h4>
                  {isCostLens ? (
                    <div className="w-full bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart layout="vertical" data={costBreakdown} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" hide />
                          <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }} formatter={(value) => `$${Number(value).toFixed(2)}`} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} verticalAlign="bottom" />
                          {costBreakdown.length > 0 && Object.keys(costBreakdown[0]).filter(k => k !== 'name').map(key => (
                            <Bar key={key} dataKey={key} stackId="a" fill={COST_COLORS[key as keyof typeof COST_COLORS] || '#94a3b8'} radius={[0, 0, 0, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    telemetryData && chartKeys.length > 0 ? (
                      <div className="w-full h-40">
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={telemetryData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                            <defs>
                              {chartKeys.map((index, key) => (
                                <linearGradient key={key} id={`color${key}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={CHART_COLORS[Number(index) % CHART_COLORS.length]} stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor={CHART_COLORS[Number(index) % CHART_COLORS.length]} stopOpacity={0}/>
                                </linearGradient>
                              ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                            <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ textTransform: 'capitalize' }} />
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
              )}

              {/* FINOPS RECOMMENDATIONS AND PROPERTIES UNCHANGED */}
              {isCostLens && finopsRecommendation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border bg-emerald-50 dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30 relative overflow-hidden group"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110" />
                  <h4 className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Right-Sizing Suggestion
                  </h4>
                  <p className="text-sm font-medium text-slate-800 dark:text-white mb-1">{finopsRecommendation.action}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-emerald-200 dark:border-slate-800">
                    <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-orange-500" /> {finopsRecommendation.issue}
                    </span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      Save {finopsRecommendation.savings}
                    </span>
                  </div>
                </motion.div>
              )}

              <Separator className="bg-slate-200 dark:bg-slate-800" />

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
            // REPLACED: Empty State is now the Global Overview!
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

              {/* Environment Status */}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-3 h-3" /> Environment Status
                </h3>
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">System Health</span>
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    OPTIMAL
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              {/* Topology Metrics */}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                  <Server className="w-3 h-3" /> Topology Metrics
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Total Nodes" value={nodes.length} />
                  <MetricCard label="Connections" value={edges.length} />
                  <MetricCard label="Services" value={resourceTypesCount} />
                  <MetricCard label="Active Zones" value="2" />
                </div>
              </div>

              <Separator className="bg-slate-200 dark:bg-slate-800" />

              {/* Active Lens Context */}
              <div>
                <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                  <Zap className="w-3 h-3" /> Active Lens
                </h3>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 transition-all duration-300">
                  <Badge variant="outline" className="mb-2 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                    {activeLens.replace('-', ' ').toUpperCase()}
                  </Badge>

                  {activeLens === 'cost' && (
                    <div className="mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 font-bold">Monthly Run Rate</p>
                      <p className="text-2xl font-black text-slate-800 dark:text-slate-100">
                        ${estimatedGlobalCost.toLocaleString()}<span className="text-sm text-slate-500 font-medium">/mo</span>
                      </p>
                    </div>
                  )}

                  {activeLens === 'structural' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                      Viewing standard architectural hierarchy, resource placement, and network routing paths.
                    </p>
                  )}

                  {activeLens === 'blast-radius' && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 leading-relaxed mt-1 font-medium animate-in fade-in slide-in-from-bottom-2 duration-300">
                      Select any node on the canvas to simulate a failure and map the downstream impact.
                    </p>
                  )}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}