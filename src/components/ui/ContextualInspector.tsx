'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion, useSpring } from 'framer-motion';
import { XIcon, TrendDownIcon, WarningIcon, ShieldWarningIcon, PulseIcon, HardDrivesIcon, LightningIcon, ShieldIcon, InfoIcon } from '@phosphor-icons/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { useBlastRadius } from '../../hooks/useBlastRadius';
import { useSecurityAudit } from '../../hooks/useSecurityAudit';
import { slideInRight, slideOutRight, staggerContainer, staggerItem } from '../../lib/motion';

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

const TABS = ['General', 'Metrics & Cost', 'Security', 'Blast Radius'];

const tabContentVariants = {
  enter: { opacity: 0, y: 6 },
  center: { opacity: 1, y: 0, transition: { duration: 0.15, delay: 0.08 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } }
};

function AnimatedCounter({ value }: { value: number }) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const springValue = useSpring(0, { stiffness: 100, damping: 30 });
  
  useEffect(() => {
    if (value > 100) {
      springValue.set(value);
      const unsubscribe = springValue.on("change", (latest) => {
        if (nodeRef.current) {
          nodeRef.current.textContent = Math.round(latest).toLocaleString();
        }
      });
      return unsubscribe;
    } else {
      if (nodeRef.current) {
        nodeRef.current.textContent = value.toLocaleString();
      }
    }
  }, [value, springValue]);

  return <span ref={nodeRef}>{value <= 100 ? value.toLocaleString() : "0"}</span>;
}

function ComplianceProgressBar({ label, percentage }: { label: string, percentage: number }) {
  return (
    <motion.div variants={staggerItem} className="mb-3">
      <div className="flex justify-between text-[11px] font-medium text-[var(--gl-text-muted)] mb-1 uppercase tracking-[0.7px]">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-indigo-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
        />
      </div>
    </motion.div>
  );
}

const getSeverityStyles = (severity: string) => {
  switch(severity?.toLowerCase()) {
    case 'critical': return "text-red-500 text-[14px] font-medium";
    case 'high': return "text-orange-500 text-[13px] font-medium";
    case 'medium': return "text-amber-500 text-[13px] font-normal";
    default: return "text-slate-500 dark:text-slate-400 text-[12px] font-normal";
  }
};

export default function ContextualInspector() {
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  
  const activeLens = useCanvasStore((state) => state.activeLens);
  const complianceFramework = useCanvasStore((state) => state.complianceFramework);
  const isLiveStreamActive = useCanvasStore((state) => state.isLiveStreamActive);
  const toggleLiveStream = useCanvasStore((state) => state.toggleLiveStream);

  const [activeTab, setActiveTab] = useState(TABS[0]);
  const isPinned = useCanvasStore((state) => state.isInspectorPinned);
  const setIsPinned = useCanvasStore((state) => state.setInspectorPinned);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const data = selectedNode?.data as Record<string, any> | undefined;

  const isTourActive = useCanvasStore((state) => state.isTourActive);

  const isExpanded = selectedNode !== undefined || isPinned || isHovered || isTourActive;

  useEffect(() => {
    if (activeLens === 'security') setActiveTab('Security');
    else if (activeLens === 'cost') setActiveTab('Metrics & Cost');
    else if (activeLens === 'blast-radius') setActiveTab('Blast Radius');
    else setActiveTab('General');
  }, [activeLens, selectedNodeId]);

  const handleMouseEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setIsHovered(true), 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setIsHovered(false);
  };

  const handleClick = () => {
    if (!isPinned) setIsPinned(true);
  };

  const { affectedNodes } = useBlastRadius(selectedNodeId);
  const { vulnerabilities, score } = useSecurityAudit();

  const nodeVulnerabilities = useMemo(() => {
    return vulnerabilities.filter(v => v.nodeId === selectedNodeId);
  }, [vulnerabilities, selectedNodeId]);

  const formatMetricLabel = (str: string) => {
    const spaced = str.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  };

  const telemetryData = data?.telemetryData;
  const chartKeys = telemetryData?.[0] ? Object.keys(telemetryData[0]).filter(k => k !== 'time') : [];

  const resourceTypesCount = new Set(nodes.map(n => n.type)).size;

  const estimatedGlobalCost = useMemo(() => {
    return nodes.reduce((sum, node) => {
      const cost = (node.data as any)?.metrics?.estMonthlyCost;
      return sum + (Number(cost) || 0);
    }, 0);
  }, [nodes]);

  const costBreakdown = useMemo(() => {
    let total = 0;
    let nodeType = '';
    if (selectedNode && data?.metrics?.estMonthlyCost) {
      total = data.metrics.estMonthlyCost;
      nodeType = selectedNode.type || '';
    } else {
      total = estimatedGlobalCost;
      nodeType = 'Global';
    }
    let breakdown = {};
    switch (nodeType) {
      case 'databaseNode': breakdown = { Compute: total * 0.5, Storage: total * 0.35, Network: total * 0.15 }; break;
      case 'lambdaNode': breakdown = { Compute: total * 0.8, Network: total * 0.2 }; break;
      case 's3Node': breakdown = { Storage: total * 0.85, Network: total * 0.15 }; break;
      case 'apiGatewayNode': breakdown = { Compute: total * 0.65, Network: total * 0.35 }; break;
      case 'sqsNode': breakdown = { Base: total * 0.85, Network: total * 0.15 }; break;
      case 'VPC':
      case 'Subnet':
      case 'Global':
        breakdown = { NATGateway: total * 0.45, EgressTraffic: total * 0.35, CrossAZ: total * 0.15, Base: total * 0.05 };
        break;
      default: breakdown = { Base: total * 0.7, Network: total * 0.3 };
    }
    return [{ name: 'Monthly Spend', ...breakdown }];
  }, [data, selectedNode, estimatedGlobalCost]);

  const finopsRecommendation = useMemo(() => {
    if (!selectedNode) return null;
    if (selectedNode.id === 'lambda-processor') return { issue: "Over-provisioned Memory", action: "Downgrade allocated memory from 1024MB to 512MB.", savings: "$160/mo", severity: "high" };
    if (selectedNode.id === 'db-mongo-cluster') return { issue: "Low CPU Utilization (24%)", action: "Downsize from Dedicated M10 to M5.", savings: "$400/mo", severity: "medium" };
    if (selectedNode.type === 'VPC' || selectedNode.type === 'Subnet') {
      return { issue: "High NAT Gateway Processing", action: "Deploy VPC Gateway Endpoints for S3 to bypass NAT data transfer processing charges.", savings: "$210/mo", severity: "medium" };
    }
    return null;
  }, [selectedNode]);

  return (
    <div 
      data-tour-id="inspector-panel" 
      className={`absolute top-0 right-0 h-full ${isExpanded ? 'w-[360px]' : 'w-12 cursor-pointer'} bg-white/80 dark:bg-[#111111] backdrop-blur-xl border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col shadow-2xl transition-[width] duration-[280ms] ease-in-out overflow-hidden`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {!isExpanded ? (
        <div className="flex-1 w-full flex flex-col items-center py-6 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
          <InfoIcon className="w-5 h-5 mb-6" />
          <div className="[writing-mode:vertical-lr] text-[11px] font-medium tracking-[0.7px] uppercase rotate-180 text-[var(--gl-text-muted)] whitespace-nowrap">
            GLOBAL OVERVIEW
          </div>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.1 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="flex flex-col h-full w-[360px]"
          >
            {/* Header */}
            <div className="p-5 border-b bg-slate-50/50 dark:bg-[#111111] border-slate-200 dark:border-slate-800 flex justify-between items-start shrink-0">
              <div>
                <Badge variant="secondary" className="mb-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  {selectedNode ? selectedNode.type?.replace('Node', '').toUpperCase() : 'GLOBAL OVERVIEW'}
                </Badge>
                <h3 className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)]">
                  {selectedNode ? (data?.name || selectedNode.id) : 'Infrastructure Posture'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {!selectedNode && (
                  <button onClick={(e) => { e.stopPropagation(); setIsPinned(!isPinned); }} className="text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)] transition-colors" title={isPinned ? "Unpin" : "Pin"}>
                    <InfoIcon className={`w-4 h-4 ${isPinned ? 'text-indigo-500' : ''}`} />
                  </button>
                )}
                {selectedNode && (
                  <button onClick={(e) => { e.stopPropagation(); setSelectedNodeId(null); setIsPinned(false); setIsHovered(false); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex px-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#111111] shrink-0">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
                  className={`relative px-3 py-3 text-[11px] font-medium tracking-[0.7px] uppercase transition-colors ${
                    activeTab === tab ? 'text-[var(--gl-text-primary)]' : 'text-[var(--gl-text-muted)] hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-5 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab + (selectedNode ? 'node' : 'global')}
                  variants={tabContentVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="space-y-6"
                >
                  {activeTab === 'General' && (
                    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                      {selectedNode && data ? (
                        <>
                          <motion.div variants={staggerItem}>
                            <p className="text-[12px] font-normal text-[var(--gl-text-muted)] mt-1">{data.insights}</p>
                          </motion.div>
                          <Separator className="bg-slate-200 dark:bg-slate-800" />
                          <motion.div variants={staggerContainer} initial="initial" animate="animate">
                            <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3">Instance Properties</h4>
                            <div className="space-y-2">
                              {data.metrics && Object.entries(data.metrics).map(([key, value]) => (
                                <motion.div variants={staggerItem} key={key} className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                                  <span className="text-[12px] text-[var(--gl-text-muted)]">
                                    {formatMetricLabel(key)}
                                  </span>
                                  <span className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)]">
                                    {!isNaN(Number(value)) && <AnimatedCounter value={Number(value)} />}
                                    {isNaN(Number(value)) && String(value)}
                                  </span>
                                </motion.div>
                              ))}
                            </div>
                          </motion.div>

                          {telemetryData && chartKeys.length > 0 && (
                            <>
                              <Separator className="bg-slate-200 dark:bg-slate-800" />
                              <motion.div variants={staggerItem}>
                                <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3">Time-Series Telemetry</h4>
                                <div className="w-full h-40">
                                  <ResponsiveContainer width="100%" height={160}>
                                    <AreaChart data={telemetryData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                                      <defs>
                                        {chartKeys.map((key, idx) => (
                                          <linearGradient key={idx} id={`colorGen${idx}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0} />
                                          </linearGradient>
                                        ))}
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                                      <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                      <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ textTransform: 'capitalize' }} />
                                      {chartKeys.map((key, index) => (
                                        <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={1} fill={`url(#colorGen${index})`} strokeWidth={2} />
                                      ))}
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              </motion.div>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <motion.div variants={staggerItem} className="flex items-center justify-between mb-3">
                            <h3 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] flex items-center gap-2">
                              <PulseIcon weight="bold" className="w-3 h-3 text-emerald-500" /> Environment Status
                            </h3>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleLiveStream(); }}
                              className={`px-3 py-1 text-[11px] font-medium tracking-[0.7px] uppercase rounded-full transition-all duration-300 border flex items-center gap-2 ${isLiveStreamActive
                                ? 'bg-red-500/10 text-red-500 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {isLiveStreamActive ? (
                                <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Live</>
                              ) : (
                                <><span className="w-2 h-2 rounded-full bg-slate-500" /> Paused</>
                              )}
                            </button>
                          </motion.div>

                          <motion.div variants={staggerItem} className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20">
                            <span className="text-[15px] font-medium tracking-[-0.3px] text-emerald-700 dark:text-emerald-400">System Health</span>
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-[12px] font-normal">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              OPTIMAL
                            </div>
                          </motion.div>

                          <Separator className="bg-slate-200 dark:bg-slate-800" />

                          <motion.div variants={staggerContainer} initial="initial" animate="animate">
                            <h3 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3 flex items-center gap-2">
                              <HardDrivesIcon weight="duotone" className="w-3 h-3" /> Topology Metrics
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30">
                                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mb-1 uppercase tracking-wider">Total Nodes</p>
                                <p className="text-lg font-medium text-slate-800 dark:text-slate-200"><AnimatedCounter value={nodes.length} /></p>
                              </div>
                              <div className="bg-slate-100 dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-3 shadow-sm">
                                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mb-1 uppercase tracking-wider">Connections</p>
                                <p className="text-lg font-medium text-slate-800 dark:text-slate-200"><AnimatedCounter value={edges.length} /></p>
                              </div>
                              <div className="bg-slate-100 dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-3 shadow-sm">
                                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mb-1 uppercase tracking-wider">Services</p>
                                <p className="text-lg font-medium text-slate-800 dark:text-slate-200"><AnimatedCounter value={resourceTypesCount} /></p>
                              </div>
                              <div className="bg-slate-100 dark:bg-[#111111] border border-slate-200 dark:border-[#222222] rounded-xl p-3 shadow-sm">
                                <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mb-1 uppercase tracking-wider">Active Zones</p>
                                <p className="text-lg font-medium text-slate-800 dark:text-slate-200">2</p>
                              </div>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'Metrics & Cost' && (
                    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                      <motion.div variants={staggerItem}>
                        <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-1">Estimated Cost</h4>
                        <p className="text-[22px] font-medium tracking-[-0.5px] text-[var(--gl-text-primary)] mt-1">
                          $<AnimatedCounter value={selectedNode ? Number(data?.metrics?.estMonthlyCost || 0) : estimatedGlobalCost} /><span className="text-[12px] text-[var(--gl-text-muted)]">/mo</span>
                        </p>
                      </motion.div>

                      <motion.div variants={staggerItem}>
                        <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3">Cost Breakdown</h4>
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
                      </motion.div>

                      {selectedNode && finopsRecommendation && (
                        <motion.div variants={staggerItem} className="p-4 rounded-xl border bg-emerald-50 dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/30">
                          <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-2 flex items-center gap-1">
                            <TrendDownIcon weight="bold" className="w-3 h-3 text-emerald-500" /> Right-Sizing Suggestion
                          </h4>
                          <p className="text-[15px] font-medium tracking-[-0.3px] text-[var(--gl-text-primary)] mb-1">{finopsRecommendation.action}</p>
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-emerald-200 dark:border-slate-800">
                            <span className="text-[12px] text-[var(--gl-text-muted)] flex items-center gap-1">
                              <WarningIcon weight="duotone" className="w-3 h-3 text-orange-500" /> {finopsRecommendation.issue}
                            </span>
                            <span className="text-[22px] font-medium tracking-[-0.5px] text-[var(--gl-text-primary)] flex items-center gap-1">
                              Save {finopsRecommendation.savings}
                            </span>
                          </div>
                        </motion.div>
                      )}

                      {selectedNode && telemetryData && chartKeys.length > 0 && (
                        <motion.div variants={staggerItem}>
                          <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3">Time-Series Telemetry</h4>
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
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'Security' && (
                    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                      {!selectedNode && (
                        <motion.div variants={staggerItem} className="flex bg-slate-100 dark:bg-[#111111] rounded-lg p-1 border border-slate-200 dark:border-slate-800">
                          {['general', 'soc2', 'hipaa'].map((fw) => (
                            <button
                              key={fw}
                              onClick={(e) => { e.stopPropagation(); useCanvasStore.getState().setComplianceFramework(fw as any); }}
                              className={`flex-1 text-[11px] font-medium tracking-[0.7px] uppercase py-1.5 rounded-md transition-all ${
                                complianceFramework === fw
                                  ? 'bg-white dark:bg-slate-800 text-[var(--gl-text-primary)] shadow-sm'
                                  : 'text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)]'
                              }`}
                            >
                              {fw}
                            </button>
                          ))}
                        </motion.div>
                      )}

                      {!selectedNode && (
                        <motion.div variants={staggerItem} className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] flex items-center gap-2">
                              <ShieldIcon weight="duotone" className="w-3 h-3 text-amber-500" /> Risk Score
                            </h4>
                            <span className="text-[22px] font-medium tracking-[-0.5px] text-[var(--gl-text-primary)]">
                              <AnimatedCounter value={score} /><span className="text-[12px] text-[var(--gl-text-muted)]">/100</span>
                            </span>
                          </div>
                        </motion.div>
                      )}

                      <motion.div variants={staggerContainer} initial="initial" animate="animate">
                        <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3 flex items-center gap-2">
                          <ShieldIcon weight="duotone" className="w-3 h-3" /> Compliance Progress
                        </h4>
                        <ComplianceProgressBar label="SOC 2 Readiness" percentage={85} />
                        <ComplianceProgressBar label="HIPAA Compliance" percentage={62} />
                        <ComplianceProgressBar label="CIS Benchmarks" percentage={94} />
                      </motion.div>

                      <Separator className="bg-slate-200 dark:bg-slate-800" />

                      <motion.div variants={staggerItem}>
                        <h4 className={`text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3 flex items-center gap-2`}>
                          <ShieldWarningIcon weight="duotone" className="w-3 h-3 text-amber-500" /> Active Misconfigurations
                        </h4>
                        {selectedNode ? (
                          nodeVulnerabilities.length > 0 ? (
                            <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
                              {nodeVulnerabilities.map((vuln, idx) => (
                                <motion.div variants={staggerItem} key={idx} className="p-3 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-amber-100 dark:border-amber-900/30">
                                  <p className={`${getSeverityStyles(vuln.severity)} mb-1`}>{vuln.issue}</p>
                                  <p className="text-[12px] font-normal text-[var(--gl-text-muted)] border-l-2 border-amber-300 dark:border-amber-700 pl-2">
                                    {vuln.remediation}
                                  </p>
                                </motion.div>
                              ))}
                            </motion.div>
                          ) : (
                            <p className="text-[12px] font-normal text-[var(--gl-text-muted)] italic">No compliance violations detected on this resource.</p>
                          )
                        ) : (
                          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-3">
                            {vulnerabilities.map((vuln, idx) => (
                              <motion.div variants={staggerItem} key={idx} className="p-3 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-amber-100 dark:border-amber-900/30">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[12px] font-medium text-[var(--gl-text-muted)]">{vuln.name}</span>
                                  <span className={getSeverityStyles(vuln.severity)}>{vuln.severity.toUpperCase()}</span>
                                </div>
                                <p className="text-[12px] font-normal text-[var(--gl-text-primary)] mb-2">{vuln.issue}</p>
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </motion.div>
                    </motion.div>
                  )}

                  {activeTab === 'Blast Radius' && (
                    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-6">
                      {selectedNode ? (
                        <motion.div variants={staggerItem} className="p-4 rounded-xl border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50">
                          <h4 className="text-[11px] font-medium tracking-[0.7px] uppercase text-[var(--gl-text-muted)] mb-3 flex items-center gap-2">
                            <PulseIcon weight="bold" className="w-3 h-3 text-red-500" /> Cascading Failure
                          </h4>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-[12px] text-[var(--gl-text-muted)]">Downstream Services Affected</span>
                            <span className="text-[22px] font-medium tracking-[-0.5px] text-[var(--gl-text-primary)]"><AnimatedCounter value={affectedNodes.length} /></span>
                          </div>
                          <Separator className="bg-red-200 dark:bg-red-900/50 mb-4" />
                          <div className="space-y-2">
                            {affectedNodes.length > 0 ? affectedNodes.map(node => (
                              <div key={node.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-red-100 dark:border-red-900/30">
                                <span className="text-[12px] font-normal text-[var(--gl-text-muted)] truncate">{(node.data as any)?.name || node.id}</span>
                              </div>
                            )) : (
                              <p className="text-[12px] font-normal text-[var(--gl-text-muted)] italic">No downstream dependencies. Safe to isolate.</p>
                            )}
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div variants={staggerItem} className="flex flex-col items-center justify-center p-6 text-center border border-dashed rounded-xl border-slate-200 dark:border-slate-800">
                          <PulseIcon weight="duotone" className="w-8 h-8 text-slate-400 mb-3" />
                          <p className="text-[12px] font-normal text-[var(--gl-text-muted)]">Select any node on the canvas to simulate a failure and map the downstream impact.</p>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}