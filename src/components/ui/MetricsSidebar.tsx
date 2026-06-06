'use client';

import React from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, LayoutDashboard, Zap, Server } from 'lucide-react';

export default function MetricsSidebar() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const activeLens = useCanvasStore((state) => state.activeLens);

  // Dynamic calculations based on your route.ts data
  const resourceTypesCount = new Set(nodes.map(n => n.type)).size;

  // Calculate real total cost by summing up data.metrics.estMonthlyCost from all nodes
  const estimatedGlobalCost = nodes.reduce((sum, node) => {
    const cost = (node.data as any)?.metrics?.estMonthlyCost;
    return sum + (Number(cost) || 0);
  }, 0);

  return (
    <div className="absolute top-0 left-0 h-full w-72 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-r border-slate-200 dark:border-slate-800 z-30 flex flex-col shadow-xl transition-colors duration-300">

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
  <div className="flex items-center justify-between">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
      Global Overview
    </h2>
    <span className="text-[10px] font-medium text-slate-400">
      Live
    </span>
  </div>
</div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">

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

      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30">
      <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mb-1 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-black text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}