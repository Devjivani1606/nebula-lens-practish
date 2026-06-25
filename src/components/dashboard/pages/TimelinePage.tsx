"use client";

import { useState, useEffect } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useDashboardStore } from "../useDashboardStore";
import { 
  Clock, ArrowsClockwise, Eye, GitFork, 
  TrendUp, ArrowUpRight, ArrowDownRight, Folder, Info
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface SnapshotVersion {
  version_id: string;
  version_number: number;
  label: string;
  is_latest: boolean;
  created_at: string;
  summary: {
    total_resources: number;
  };
  costs: {
    total_monthly: number;
    by_service: Record<string, number>;
  };
  changes: {
    added: number;
    removed: number;
    modified: number;
  };
}

interface DiffItem {
  id: string;
  change_type: "added" | "removed" | "modified";
  resource_arn: string;
  resource_type: string;
  change_details: any;
}

export default function TimelinePage() {
  const [versions, setVersions] = useState<SnapshotVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<SnapshotVersion | null>(null);
  const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "changes">("summary");

  const { fetchInfrastructure, setActiveSnapshotId, selectedAccountId } = useCanvasStore();
  const { setActiveSection } = useDashboardStore();

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const url = selectedAccountId ? `/api/history?account_id=${selectedAccountId}` : "/api/history";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const list = data.versions || [];
        setVersions(list);
        if (list.length > 0) {
          setSelectedVersion(list[0]);
        }
      }
    } catch (e) {
      console.error("Error fetching snapshot history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchDiff = async (snapId: string) => {
    setLoadingDiff(true);
    try {
      const res = await fetch(`/api/history?snapshot_id=${snapId}&diff=true`);
      if (res.ok) {
        const data = await res.json();
        setDiffItems(data.diffs || []);
      }
    } catch (e) {
      console.error("Error fetching snapshot diff:", e);
    } finally {
      setLoadingDiff(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedVersion) {
      fetchDiff(selectedVersion.version_id);
    }
  }, [selectedVersion]);

  const handleViewGraph = async (version: SnapshotVersion) => {
    setActiveSnapshotId(version.version_id);
    await fetchInfrastructure(version.version_id);
    setActiveSection("canvas");
  };

  const safeLastSegment = (str: string | null | undefined) => {
    if (!str) return "N/A";
    const idx = str.lastIndexOf(":");
    return idx !== -1 ? str.substring(idx + 1) : str;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--gl-bg-base)]">
      {/* Page Header */}
      <div className="p-8 pb-4 flex justify-between items-center gap-4 border-b border-[var(--gl-border)] bg-[var(--gl-bg-panel)] shrink-0">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--gl-text-primary)] flex items-center gap-2">
            <Clock size={24} className="text-indigo-500" />
            Infrastructure Timeline
          </h1>
          <p className="text-xs text-[var(--gl-text-muted)]">
            Explore and replay the historical evolution of your cloud resources, changes, and cost progression.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHistory}
          disabled={loadingHistory}
          className="h-9 gap-2 border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] text-xs text-[var(--gl-text-secondary)]"
        >
          <ArrowsClockwise size={14} className={loadingHistory ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Section: Scrollable Vertical Timeline */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-xs text-[var(--gl-text-muted)]">
              <ArrowsClockwise size={24} className="animate-spin text-indigo-500" />
              Loading history feed...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 italic text-xs text-[var(--gl-text-muted)]">
              No snapshot history available for this account. Run an infrastructure scan first.
            </div>
          ) : (
            <div className="relative max-w-2xl mx-auto pl-8">
              
              {/* Vertical line connector */}
              <div 
                className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-500 to-slate-200 dark:to-slate-800" 
              />

              <div className="flex flex-col gap-8">
                {versions.map((v) => {
                  const isSelected = selectedVersion?.version_id === v.version_id;
                  const totalChanges = v.changes.added + v.changes.removed + v.changes.modified;

                  return (
                    <motion.div
                      key={v.version_id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35 }}
                      onClick={() => setSelectedVersion(v)}
                      className={`relative group cursor-pointer border rounded-2xl p-5 shadow-sm transition-all duration-200 ${
                        isSelected
                          ? "bg-[var(--gl-bg-panel)] border-indigo-500 ring-1 ring-indigo-500/20"
                          : "bg-[var(--gl-bg-panel)] border-[var(--gl-border)] hover:border-indigo-400/50 hover:bg-[var(--gl-bg-muted)]"
                      }`}
                    >
                      {/* Timeline Node Dot */}
                      <div 
                        className={`absolute -left-[30px] top-[24px] w-4.5 h-4.5 rounded-full border-2 transition-all duration-200 ${
                          isSelected
                            ? "bg-indigo-500 border-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)] scale-110"
                            : "bg-[var(--gl-bg-base)] border-indigo-400 group-hover:bg-indigo-400"
                        }`}
                      />

                      {/* Card Content */}
                      <div className="flex flex-col gap-2.5">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[var(--gl-text-primary)]">
                                {v.label}
                              </span>
                              {v.is_latest && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wide">
                                  Current
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[var(--gl-text-muted)]">
                              {new Date(v.created_at).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-sm font-bold text-[var(--gl-text-primary)]">
                              ${v.costs.total_monthly.toFixed(2)}/mo
                            </span>
                            <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--gl-text-muted)]">
                              Est. Run Rate
                            </span>
                          </div>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-3 gap-2 bg-[var(--gl-bg-muted)]/50 border border-[var(--gl-border)]/50 p-2.5 rounded-xl text-center text-xs">
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Resources</span>
                            <span className="font-bold text-[var(--gl-text-primary)] mt-0.5">
                              {v.summary.total_resources}
                            </span>
                          </div>
                          <div className="flex flex-col border-x border-[var(--gl-border)]/60">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Changes</span>
                            <span className={`font-bold mt-0.5 ${totalChanges > 0 ? "text-indigo-400" : "text-[var(--gl-text-muted)]"}`}>
                              {totalChanges > 0 ? `+${totalChanges}` : "0"}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)] font-sans">Compare</span>
                            <div className="flex justify-center items-center gap-1.5 mt-0.5 font-bold">
                              {v.changes.added > 0 && <span className="text-emerald-400" title="Added">+{v.changes.added}</span>}
                              {v.changes.removed > 0 && <span className="text-red-400" title="Removed">-{v.changes.removed}</span>}
                              {v.changes.modified > 0 && <span className="text-amber-400" title="Modified">~{v.changes.modified}</span>}
                              {totalChanges === 0 && <span className="text-[var(--gl-text-muted)] font-normal italic">-</span>}
                            </div>
                          </div>
                        </div>

                        {/* Buttons Footer */}
                        <div className="flex justify-end items-center gap-2.5 mt-1 border-t border-[var(--gl-border)]/50 pt-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewGraph(v);
                            }}
                            className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-blue-400 hover:text-blue-500 transition-colors"
                          >
                            <Eye size={12} />
                            View Canvas
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Section: Inspector Details Panel */}
        <div className="w-full lg:w-[420px] border-t lg:border-t-0 lg:border-l border-[var(--gl-border)] bg-[var(--gl-bg-panel)] flex flex-col overflow-hidden shrink-0">
          <AnimatePresence mode="wait">
            {selectedVersion ? (
              <motion.div
                key={selectedVersion.version_id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex flex-col h-full overflow-hidden"
              >
                {/* Panel Header */}
                <div className="p-6 border-b border-[var(--gl-border)] flex flex-col gap-1 shrink-0">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Snapshot Info</span>
                  <h2 className="text-lg font-bold text-[var(--gl-text-primary)]">{selectedVersion.label}</h2>
                  <p className="text-[10px] text-[var(--gl-text-muted)]">
                    Scanned on {new Date(selectedVersion.created_at).toLocaleString()}
                  </p>
                </div>

                {/* Tab buttons */}
                <div className="flex border-b border-[var(--gl-border)] px-6 bg-[var(--gl-bg-muted)]/30 shrink-0">
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
                      activeTab === "summary"
                        ? "border-indigo-500 text-indigo-400"
                        : "border-transparent text-[var(--gl-text-muted)] hover:text-[var(--gl-text-secondary)]"
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    onClick={() => setActiveTab("changes")}
                    className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-1.5 ${
                      activeTab === "changes"
                        ? "border-indigo-500 text-indigo-400"
                        : "border-transparent text-[var(--gl-text-muted)] hover:text-[var(--gl-text-secondary)]"
                    }`}
                  >
                    <GitFork size={14} />
                    Changes ({diffItems.length})
                  </button>
                </div>

                {/* Tab Contents */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeTab === "summary" && (
                    <div className="flex flex-col gap-6">
                      
                      {/* Cost Summary Box */}
                      <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/10 p-5 rounded-2xl flex justify-between items-center">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Monthly Run Rate</span>
                          <span className="text-2xl font-extrabold text-[var(--gl-text-primary)] mt-1">
                            ${selectedVersion.costs.total_monthly.toFixed(2)}
                          </span>
                        </div>
                        <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400">
                          <TrendUp size={24} />
                        </div>
                      </div>

                      {/* Service Breakdown */}
                      <div className="flex flex-col gap-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--gl-text-muted)]">Cost By Service</h3>
                        <div className="flex flex-col gap-2.5">
                          {Object.keys(selectedVersion.costs.by_service).length === 0 ? (
                            <span className="text-xs text-[var(--gl-text-muted)] italic">No cost distribution details.</span>
                          ) : (
                            Object.entries(selectedVersion.costs.by_service).map(([service, cost]) => (
                              <div key={service} className="flex flex-col gap-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-bold text-[var(--gl-text-secondary)] uppercase">{service}</span>
                                  <span className="font-mono font-medium text-[var(--gl-text-primary)]">${cost.toFixed(2)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-[var(--gl-border)] rounded-full overflow-hidden">
                                  <div
                                    style={{
                                      width: `${
                                        selectedVersion.costs.total_monthly > 0
                                          ? (cost / selectedVersion.costs.total_monthly) * 100
                                          : 0
                                      }%`
                                    }}
                                    className="h-full bg-indigo-500 rounded-full"
                                  />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "changes" && (
                    <div className="flex flex-col gap-4">
                      {loadingDiff ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-xs text-[var(--gl-text-muted)]">
                          <ArrowsClockwise size={16} className="animate-spin text-indigo-500" />
                          Loading comparisons...
                        </div>
                      ) : diffItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-[var(--gl-text-muted)] gap-2">
                          <Info size={24} className="text-[var(--gl-text-muted)]" />
                          <span>No resource additions, deletions, or modifications in this version compared to the previous snapshot.</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {diffItems.map((item) => (
                            <div
                              key={item.id}
                              className={`p-3 rounded-xl border flex flex-col gap-1.5 ${
                                item.change_type === "added"
                                  ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                                  : item.change_type === "removed"
                                  ? "bg-red-500/5 border-red-500/20 text-red-400"
                                  : "bg-amber-500/5 border-amber-500/20 text-amber-400"
                              }`}
                            >
                              <div className="flex justify-between items-center gap-3">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider font-mono ${
                                  item.change_type === "added"
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : item.change_type === "removed"
                                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                }`}>
                                  {item.change_type}
                                </span>
                                <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--gl-text-muted)] flex items-center gap-1">
                                  <Folder size={12} />
                                  {item.resource_type || "Resource"}
                                </span>
                              </div>

                              <div className="text-xs font-mono truncate text-[var(--gl-text-primary)]" title={item.resource_arn}>
                                {safeLastSegment(item.resource_arn)}
                              </div>

                              {item.change_details && (
                                <div className="text-[10px] text-[var(--gl-text-secondary)] font-sans border-t border-[var(--gl-border)]/20 pt-1.5 mt-0.5">
                                  {typeof item.change_details === "string" 
                                    ? item.change_details 
                                    : JSON.stringify(item.change_details)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Replay Graph button in footer */}
                <div className="p-6 border-t border-[var(--gl-border)] bg-[var(--gl-bg-muted)]/20 shrink-0">
                  <Button
                    onClick={() => handleViewGraph(selectedVersion)}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-all duration-200"
                  >
                    <Eye size={18} />
                    Replay Graph State
                  </Button>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-[var(--gl-text-muted)] italic">
                Select a version on the timeline to inspect its architecture changes and cost distribution.
              </div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
