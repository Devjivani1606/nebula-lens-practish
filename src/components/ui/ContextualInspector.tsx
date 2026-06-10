'use client';

import React, { useMemo } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from 'framer-motion';
import { X, TrendingDown, AlertTriangle, ShieldAlert, Activity, Server, Zap, Shield } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useBlastRadius } from '../../hooks/useBlastRadius';
import { useSecurityAudit } from '../../hooks/useSecurityAudit';

const CHART_COLORS = ['#38bdf8', '#34d399', '#f472b6', '#fbbf24'];
const COST_COLORS = {
  Base: '#8b5cf6',
  Compute: '#3b82f6',
  Network: '#f59e0b',
  Storage: '#10b981',
  NATGateway: '#ec4899',
  EgressTraffic: '#ef4444',
  CrossAZ: '#f97316'
};

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
  const edges = useCanvasStore((state) => state.edges);

  const activeLens = useCanvasStore((state) => state.activeLens);
  const isCostLens = activeLens === 'cost';
  const isBlastRadiusLens = activeLens === 'blast-radius';
  const isSecurityLens = activeLens === 'security';

  const complianceFramework = useCanvasStore((state) => state.complianceFramework);
  const isLiveStreamActive = useCanvasStore((state) => state.isLiveStreamActive);
  const toggleLiveStream = useCanvasStore((state) => state.toggleLiveStream);
  const tickTelemetry = useCanvasStore((state) => state.tickTelemetry);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as Record<string, any> | undefined;

  const { affectedNodes } = useBlastRadius(selectedNodeId);
  const { vulnerabilities, score } = useSecurityAudit();

  // Extract vulnerabilities mapped uniquely to this specific node instance
  const nodeVulnerabilities = useMemo(() => {
    return vulnerabilities.filter(v => v.nodeId === selectedNodeId);
  }, [vulnerabilities, selectedNodeId]);

  const resourceTypesCount = new Set(nodes.map(n => n.type)).size;

  const estimatedGlobalCost = useMemo(() => {
    return nodes.reduce((sum, node) => {
      const cost = (node.data as any)?.metrics?.estMonthlyCost;
      return sum + (Number(cost) || 0);
    }, 0);
  }, [nodes]);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLiveStreamActive) {
      interval = setInterval(() => {
        tickTelemetry();
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isLiveStreamActive, tickTelemetry]);

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
        breakdown = { NATGateway: total * 0.45, EgressTraffic: total * 0.35, CrossAZ: total * 0.15, Base: total * 0.05 };
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
      return { issue: "High NAT Gateway Processing", action: "Deploy VPC Gateway Endpoints for S3 to bypass NAT data transfer processing charges.", savings: "$210/mo", severity: "medium" };
    }
    return null;
  }, [selectedNode, isCostLens]);

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
    } else if (isSecurityLens) {
      headerBg = 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50';
      headerText = 'text-amber-600 dark:text-amber-400';
      panelTitle = 'Target Security Profile';
    }
  } else {
    if (isSecurityLens) {
      headerBg = 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50';
      headerText = 'text-amber-600 dark:text-amber-400';
      panelTitle = 'Security Posture Report';
    } else {
      panelTitle = 'Global Overview';
    }
  }

  return (
    <div data-tour-id="inspector-panel" className="absolute top-0 right-0 h-full w-80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col shadow-xl transition-colors duration-300">

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

              <div>
                <Badge variant="secondary" className={`mb-2 ${isCostLens ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
                    isBlastRadiusLens ? 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30' :
                      isSecurityLens ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
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
                ) : isSecurityLens ? (
                  <p className="text-sm font-bold text-amber-500 mt-1 flex items-center gap-1">
                    <Shield className="w-4 h-4" /> System Threat Assessment
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{data.insights}</p>
                )}
              </div>

              {/* 🚀 THREE-WAY SWITCH FOR ACTIVE VIEWS */}
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
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{(node.data as any)?.name || node.id}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">No downstream dependencies. Safe to isolate.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : isSecurityLens ? (
                /* 🚀 FIXED: Renders target vulnerabilities and kill chain when node is selected */
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className={`p-4 rounded-xl border ${nodeVulnerabilities.length > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'}`}>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 ${nodeVulnerabilities.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {nodeVulnerabilities.length > 0 ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                      {nodeVulnerabilities.length > 0 ? 'Active Misconfigurations' : 'Node Secure'}
                    </h4>
                    {nodeVulnerabilities.length > 0 ? (
                      <div className="space-y-3">
                        {nodeVulnerabilities.map((vuln, idx) => (
                          <div key={idx} className="p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-amber-100 dark:border-amber-900/30">
                            <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 mb-1">{vuln.issue}</p>
                            <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-400 border-l-2 border-amber-300 dark:border-amber-700 pl-2">
                              {vuln.remediation}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400 italic">No compliance violations detected on this resource.</p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50">
                    <h4 className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Activity className="w-3 h-3 animate-pulse" /> Lateral Breach Path
                    </h4>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">
                      If compromised, attackers gain network access to the following downstream targets:
                    </p>
                    <div className="space-y-2">
                      {affectedNodes.length > 0 ? affectedNodes.map(node => (
                        <div key={node.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-red-100 dark:border-red-900/30">
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{(node.data as any)?.name || node.id}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">No downstream network access. Threat contained.</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    {isCostLens ? 'Financial Breakdown' : 'Time-Series Telemetry'}
                  </h4>
                  {isCostLens ? (
                    <div className="w-full h-48 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2 border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                      <ResponsiveContainer width="100%" height={196}>
                        <BarChart layout="vertical" data={costBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" hide />
                          <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }} formatter={(value) => `$${Number(value).toFixed(2)}`} />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} verticalAlign="bottom" />
                          {Object.keys(COST_COLORS).map(key => (
                            <Bar key={key} dataKey={key} stackId="a" fill={COST_COLORS[key as keyof typeof COST_COLORS]} radius={[0, 0, 0, 0]} />
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
                                  <stop offset="5%" stopColor={CHART_COLORS[Number(index) % CHART_COLORS.length]} stopOpacity={0.3} />
                                  <stop offset="95%" stopColor={CHART_COLORS[Number(index) % CHART_COLORS.length]} stopOpacity={0} />
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

              {isCostLens && finopsRecommendation && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl border bg-emerald-50 dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30 relative overflow-hidden group">
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
            /* ==========================================
               EMPTY STATE: GLOBAL OVERVIEW
               ========================================== */
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

              {isSecurityLens && (
                <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div data-tour-id="compliance-tabs" className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 mb-4 border border-slate-200 dark:border-slate-800">
                    {['general', 'soc2', 'hipaa'].map((fw) => (
                      <button
                        key={fw}
                        onClick={() => useCanvasStore.getState().setComplianceFramework(fw as any)}
                        className={`flex-1 text-[10px] font-black uppercase tracking-widest py-1.5 rounded-md transition-all ${complianceFramework === fw
                            ? 'bg-white dark:bg-slate-800 text-amber-600 shadow-sm'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                          }`}
                      >
                        {fw}
                      </button>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                        <Shield className="w-3 h-3" /> Risk Score
                      </h4>
                      <span className={`text-2xl font-black ${score > 80 ? 'text-emerald-500' : score > 60 ? 'text-amber-500' : 'text-red-500'}`}>
                        {score}<span className="text-sm text-slate-500 font-medium">/100</span>
                      </span>
                    </div>

                    <Separator className="bg-amber-200 dark:bg-amber-900/50 mb-4" />

                    <div className="space-y-3">
                      {vulnerabilities.map((vuln, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-amber-100 dark:border-amber-900/30">
                          <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className={`w-3 h-3 ${vuln.severity === 'critical' ? 'text-red-500' : vuln.severity === 'high' ? 'text-orange-500' : 'text-amber-500'}`} />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{vuln.name}</span>
                          </div>
                          <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-2">{vuln.issue}</p>
                          <p className="text-[9px] leading-relaxed text-slate-500 dark:text-slate-500 border-l-2 border-amber-300 dark:border-amber-700 pl-2">
                            {vuln.remediation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-3 h-3" /> Environment Status
                  </h3>

                  <button
                    data-tour-id="live-stream-toggle"
                    onClick={toggleLiveStream}
                    className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full transition-all duration-300 border flex items-center gap-2 ${isLiveStreamActive
                        ? 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    {isLiveStreamActive ? (
                      <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live Stream ON</>
                    ) : (
                      <><span className="w-2 h-2 rounded-full bg-slate-500 dark:bg-slate-400" /> Live Stream OFF</>
                    )}
                  </button>
                </div>

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

                  {activeLens === 'security' && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed mt-1 font-medium animate-in fade-in slide-in-from-bottom-2 duration-300">
                      Auditing infrastructure endpoints against compliance rules. Select an element to perform an isolated threat vector trace.
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