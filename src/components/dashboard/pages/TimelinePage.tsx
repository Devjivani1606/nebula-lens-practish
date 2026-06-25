"use client";

import { useState, useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useDashboardStore } from "../useDashboardStore";
import { Clock, ArrowsClockwise, GitFork, TrendUp, Folder, Info, Trash, Plus, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { MotionCarousel } from "@/components/animate-ui/components/community/motion-carousel";
import { ManagementBar } from "@/components/animate-ui/components/community/management-bar";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";

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
  const [isScanLoading, setIsScanLoading] = useState(false);
  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const { 
    fetchInfrastructure, 
    setActiveSnapshotId, 
    selectedAccountId, 
    connectedAccounts 
  } = useCanvasStore();
  
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
          // Keep current index focused if it still exists, else default to first
          const prevSelected = list.find((v: SnapshotVersion) => v.version_id === selectedVersion?.version_id);
          setSelectedVersion(prevSelected || list[0]);
        } else {
          setSelectedVersion(null);
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
      // Auto-open inspector when a version is selected
      setIsInspectorOpen(true);
    }
  }, [selectedVersion]);

  const selectedIndex = versions.findIndex(v => v.version_id === selectedVersion?.version_id);

  const handlePrev = () => {
    if (selectedIndex > 0) {
      setSelectedVersion(versions[selectedIndex - 1]);
    }
  };

  const handleNext = () => {
    if (selectedIndex < versions.length - 1) {
      setSelectedVersion(versions[selectedIndex + 1]);
    }
  };

  const handleCarouselSelect = (index: number) => {
    if (versions[index]) {
      setSelectedVersion(versions[index]);
    }
  };

  const handleTriggerScan = async () => {
    const currentAccount = connectedAccounts.find(a => a.id === selectedAccountId);
    const awsAccountId = currentAccount?.account_id;
    if (!awsAccountId) {
      alert("Please select a connected AWS Account first.");
      return;
    }

    setIsScanLoading(true);
    try {
      const res = await fetch(`/api/scan/trigger?account_id=${awsAccountId}`, {
        method: "POST",
      });
      if (res.ok) {
        alert("Infrastructure scan successfully enqueued!");
        setTimeout(fetchHistory, 3000);
      } else {
        alert("Failed to queue new scan. Make sure your local scan worker is active.");
      }
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      setIsScanLoading(false);
    }
  };

  const handleDeleteSnapshot = async () => {
    if (!selectedVersion) return;
    const confirm = window.confirm(`Permanently delete ${selectedVersion.label} and all its data?`);
    if (!confirm) return;

    try {
      const res = await fetch(`/api/db/data?table=snapshots&id=${selectedVersion.version_id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        alert("Snapshot deleted successfully.");
        await fetchHistory();
      } else {
        alert("Failed to delete snapshot.");
      }
    } catch (err) {
      console.error("Delete snapshot error:", err);
    }
  };

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

  const pieChartData = useMemo(() => {
    if (!selectedVersion) return [];
    const colors = ['#8b5cf6', '#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#f97316', '#38bdf8'];
    return Object.entries(selectedVersion.costs.by_service)
      .filter(([_, cost]) => cost > 0)
      .map(([service, cost], idx) => ({
        label: service.toUpperCase(),
        value: cost,
        color: colors[idx % colors.length]
      }));
  }, [selectedVersion]);

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
          className="h-9 gap-2 border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] text-xs text-[var(--gl-text-secondary)] rounded-xl"
        >
          <ArrowsClockwise size={14} className={loadingHistory ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 relative overflow-hidden flex flex-row">
        
        {/* Center Canvas / Timeline Carousel */}
        <div className={`flex-1 overflow-y-auto p-8 flex flex-col justify-between gap-8 transition-all duration-500 ease-in-out ${
          selectedVersion && isInspectorOpen ? "mr-[440px]" : "mr-0"
        }`}>
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-3 text-xs text-[var(--gl-text-muted)]">
              <ArrowsClockwise size={28} className="animate-spin text-indigo-500" />
              Loading timeline snapshots...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] text-center gap-4">
              <span className="italic text-xs text-[var(--gl-text-muted)]">
                No snapshot history available for this account. Run an infrastructure scan first.
              </span>
              <Button onClick={handleTriggerScan} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2 font-bold text-xs h-9">
                <Plus size={16} /> Connect & Scan Now
              </Button>
            </div>
          ) : (
            <div className="w-full flex flex-col flex-1 justify-center gap-8 py-4">
              {/* Premium Scale Motion Carousel */}
              <div className="w-full max-w-5xl mx-auto">
                <MotionCarousel 
                  versions={versions} 
                  selectedIndex={selectedIndex >= 0 ? selectedIndex : 0} 
                  onSelect={handleCarouselSelect}
                />
              </div>

              {/* Management Control Center */}
              <div className="w-full">
                <ManagementBar 
                  currentIndex={selectedIndex >= 0 ? selectedIndex : 0} 
                  totalIndex={versions.length} 
                  onPrev={handlePrev}
                  onNext={handleNext}
                  onDelete={handleDeleteSnapshot}
                  onScan={handleTriggerScan}
                  onReplay={() => selectedVersion && handleViewGraph(selectedVersion)}
                  isScanLoading={isScanLoading}
                  isReplayDisabled={!selectedVersion}
                />
              </div>
            </div>
          )}
        </div>

        {/* Floating Architecture Audit Deck */}
        <AnimatePresence>
          {selectedVersion && isInspectorOpen && (
            <motion.div
              initial={{ opacity: 0, x: 450, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 450, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="absolute right-6 top-6 bottom-6 w-[420px] bg-[var(--gl-bg-panel)]/80 backdrop-blur-xl border border-[var(--gl-border)] shadow-[0_0_50px_-12px_rgba(99,102,241,0.25)] rounded-2xl flex flex-col overflow-hidden z-20 border-l border-t border-indigo-500/10"
            >
              {/* Panel Header */}
              <div className="p-6 border-b border-[var(--gl-border)] flex justify-between items-start gap-4 shrink-0">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">Architecture Audit Deck</span>
                  <h2 className="text-lg font-bold text-[var(--gl-text-primary)]">{selectedVersion.label}</h2>
                  <p className="text-[10px] text-[var(--gl-text-muted)]">
                    Scanned on {new Date(selectedVersion.created_at).toLocaleString()}
                  </p>
                </div>
                <button 
                  onClick={() => setIsInspectorOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--gl-bg-muted)] text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
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

                    {/* Service Breakdown (Bklit-UI Donut Chart) */}
                    <div className="flex flex-col gap-3">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--gl-text-muted)]">Cost By Service</h3>
                      <div className="flex flex-col gap-2.5">
                        {pieChartData.length === 0 ? (
                          <span className="text-xs text-[var(--gl-text-muted)] italic">No cost distribution details.</span>
                        ) : (
                          <div className="w-full py-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-[var(--gl-border)] flex flex-col items-center justify-center">
                            <div className="w-40 h-40 flex items-center justify-center">
                              <PieChart
                                data={pieChartData}
                                innerRadius={48}
                                padAngle={0.03}
                                cornerRadius={4}
                                hoveredIndex={hoveredSlice}
                                onHoverChange={setHoveredSlice}
                              >
                                {pieChartData.map((slice, idx) => (
                                  <PieSlice key={slice.label} index={idx} hoverEffect="translate" hoverOffset={6} />
                                ))}
                                <PieCenter prefix="$" />
                              </PieChart>
                            </div>
                            
                            {/* Interactive Legend Grid */}
                            <div className="w-full px-4 mt-4 grid grid-cols-2 gap-2">
                              {pieChartData.map((slice, idx) => (
                                <div
                                  key={slice.label}
                                  className={`flex items-center gap-2 px-2 py-1 rounded transition-colors ${
                                    hoveredSlice === idx ? 'bg-slate-200/50 dark:bg-slate-800/50' : ''
                                  }`}
                                  onMouseEnter={() => setHoveredSlice(idx)}
                                  onMouseLeave={() => setHoveredSlice(null)}
                                >
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                                  <span className="text-[10px] font-semibold text-[var(--gl-text-muted)] truncate">{slice.label}</span>
                                  <span className="text-[10px] font-bold font-mono text-[var(--gl-text-primary)] ml-auto">${slice.value.toFixed(0)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
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
                  Replay Graph State
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Toggle Button when closed */}
        {!isInspectorOpen && selectedVersion && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute right-6 bottom-24 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg flex items-center gap-2 px-4 py-2.5 z-10 font-bold text-xs cursor-pointer border border-indigo-500/20"
            onClick={() => setIsInspectorOpen(true)}
          >
            <GitFork size={16} />
            View Audit Deck
          </motion.button>
        )}

      </div>
    </div>
  );
}
