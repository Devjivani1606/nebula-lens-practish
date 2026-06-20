"use client";

import { useState, useEffect } from "react";
import { 
  Database, ArrowsClockwise, TreeStructure, 
  HardDrive, GitFork, IdentificationCard, Copy, Check 
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface DbStats {
  aws_accounts: number;
  snapshots: number;
  resources_raw: number;
  relationships_raw: number;
  normalized_nodes: number;
  normalized_edges: number;
  scan_jobs: number;
}

type TableTab = "accounts" | "snapshots" | "nodes" | "edges";

export default function DbExplorerPage() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [activeTab, setActiveTab] = useState<TableTab>("accounts");
  const [tableData, setTableData] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/db/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error("Error fetching db stats:", e);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchTableData = async (tab: TableTab) => {
    setLoadingTable(true);
    try {
      const res = await fetch(`/api/db/data?table=${tab}`);
      if (res.ok) {
        const data = await res.json();
        setTableData(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(`Error fetching table ${tab}:`, e);
      setTableData([]);
    } finally {
      setLoadingTable(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTableData(activeTab);
  }, [activeTab]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredData = tableData.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return Object.values(row).some(
      (val) => val && String(val).toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-8 pb-4 flex justify-between items-center gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--gl-text-primary)] flex items-center gap-2">
            <Database size={24} className="text-indigo-500" />
            Database Explorer
          </h1>
          <p className="text-[var(--gl-text-muted)]">
            Inspect raw tables and metadata populated by Gravity Lens scan engines.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            fetchStats();
            fetchTableData(activeTab);
          }}
          disabled={loadingStats || loadingTable}
          className="h-9 gap-2 border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] text-xs"
        >
          <ArrowsClockwise size={14} className={(loadingStats || loadingTable) ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="px-8 py-6 flex flex-col gap-6">
        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="p-2.5 bg-indigo-500/10 rounded-lg text-indigo-400">
              <IdentificationCard size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Accounts</span>
              <span className="text-lg font-bold text-[var(--gl-text-primary)]">
                {loadingStats ? "..." : stats?.aws_accounts ?? 0}
              </span>
            </div>
          </div>

          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="p-2.5 bg-emerald-500/10 rounded-lg text-emerald-400">
              <TreeStructure size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Snapshots</span>
              <span className="text-lg font-bold text-[var(--gl-text-primary)]">
                {loadingStats ? "..." : stats?.snapshots ?? 0}
              </span>
            </div>
          </div>

          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="p-2.5 bg-amber-500/10 rounded-lg text-amber-400">
              <HardDrive size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Norm Nodes</span>
              <span className="text-lg font-bold text-[var(--gl-text-primary)]">
                {loadingStats ? "..." : stats?.normalized_nodes ?? 0}
              </span>
            </div>
          </div>

          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-4 shadow-sm flex items-center gap-4">
            <div className="p-2.5 bg-purple-500/10 rounded-lg text-purple-400">
              <GitFork size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Norm Edges</span>
              <span className="text-lg font-bold text-[var(--gl-text-primary)]">
                {loadingStats ? "..." : stats?.normalized_edges ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Controls & Search */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--gl-border)] pb-2 mt-2">
          <div className="flex gap-2 p-1 bg-[var(--gl-bg-muted)] border border-[var(--gl-border)] rounded-lg">
            {(["accounts", "snapshots", "nodes", "edges"] as TableTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${activeTab === tab
                  ? "bg-[var(--gl-bg-panel)] text-blue-400 shadow-sm border border-[var(--gl-border)]"
                  : "text-[var(--gl-text-muted)] hover:text-[var(--gl-text-secondary)]"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Filter ${activeTab} data...`}
            className="px-3.5 py-1.5 w-full md:w-64 rounded-lg border border-[var(--gl-border)] bg-[var(--gl-bg-panel)] text-xs text-[var(--gl-text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Table View */}
        <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl overflow-hidden shadow-sm">
          {loadingTable ? (
            <div className="p-12 text-center text-xs text-[var(--gl-text-muted)] flex flex-col items-center justify-center gap-3">
              <ArrowsClockwise size={24} className="animate-spin text-blue-500" />
              Loading table data...
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--gl-text-muted)] italic">
              {searchQuery ? "No matching records found." : `No rows found in ${activeTab} table.`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--gl-bg-muted)] border-b border-[var(--gl-border)] text-[var(--gl-text-muted)] uppercase tracking-wider text-[10px] font-bold">
                    {activeTab === "accounts" && (
                      <>
                        <th className="p-4">ID</th>
                        <th className="p-4">Account ID</th>
                        <th className="p-4">Name</th>
                        <th className="p-4">Role ARN</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Created At</th>
                      </>
                    )}
                    {activeTab === "snapshots" && (
                      <>
                        <th className="p-4">ID</th>
                        <th className="p-4">Account ID</th>
                        <th className="p-4">Version</th>
                        <th className="p-4">Label</th>
                        <th className="p-4">Is Latest</th>
                        <th className="p-4">Created At</th>
                      </>
                    )}
                    {activeTab === "nodes" && (
                      <>
                        <th className="p-4">Node ID (ARN)</th>
                        <th className="p-4">Name</th>
                        <th className="p-4">Service</th>
                        <th className="p-4">Region</th>
                        <th className="p-4">Type</th>
                        <th className="p-4">Parent ID</th>
                      </>
                    )}
                    {activeTab === "edges" && (
                      <>
                        <th className="p-4">Edge ID</th>
                        <th className="p-4">Source</th>
                        <th className="p-4">Target</th>
                        <th className="p-4">Label</th>
                        <th className="p-4">Confidence</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--gl-border)] font-mono text-[11px] text-[var(--gl-text-secondary)]">
                  {filteredData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[var(--gl-bg-muted)] transition-colors">
                      {activeTab === "accounts" && (
                        <>
                          <td className="p-4">
                            <span className="flex items-center gap-1.5">
                              {row.id.substring(0, 8)}...
                              <button onClick={() => handleCopy(row.id)} className="text-[var(--gl-text-muted)] hover:text-white">
                                {copiedId === row.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </span>
                          </td>
                          <td className="p-4 font-bold text-[var(--gl-text-primary)]">{row.account_id}</td>
                          <td className="p-4 font-sans font-medium">{row.account_name || "N/A"}</td>
                          <td className="p-4">
                            <span className="flex items-center gap-1.5 max-w-[200px] truncate" title={row.role_arn}>
                              {row.role_arn.substring(0, 20)}...
                              <button onClick={() => handleCopy(row.role_arn)} className="text-[var(--gl-text-muted)] hover:text-white shrink-0">
                                {copiedId === row.role_arn ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                              {row.status}
                            </span>
                          </td>
                          <td className="p-4 font-sans">{new Date(row.created_at).toLocaleString()}</td>
                        </>
                      )}

                      {activeTab === "snapshots" && (
                        <>
                          <td className="p-4">{row.id.substring(0, 8)}...</td>
                          <td className="p-4">{row.account_id.substring(0, 8)}...</td>
                          <td className="p-4 font-bold">v{row.version_number}</td>
                          <td className="p-4 font-sans font-medium">{row.label || "Snapshot Scan"}</td>
                          <td className="p-4">
                            {row.is_latest ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
                                Yes
                              </span>
                            ) : (
                              <span className="text-[var(--gl-text-muted)] font-sans">No</span>
                            )}
                          </td>
                          <td className="p-4 font-sans">{new Date(row.created_at).toLocaleString()}</td>
                        </>
                      )}

                      {activeTab === "nodes" && (
                        <>
                          <td className="p-4">
                            <span className="flex items-center gap-1.5 max-w-[250px] truncate" title={row.node_id}>
                              {row.node_id.substring(row.node_id.lastIndexOf(":") + 1)}
                              <button onClick={() => handleCopy(row.node_id)} className="text-[var(--gl-text-muted)] hover:text-white shrink-0">
                                {copiedId === row.node_id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </span>
                          </td>
                          <td className="p-4 font-sans font-medium text-[var(--gl-text-primary)]">{row.resource_name}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-indigo-500/10 text-indigo-400 uppercase">
                              {row.service}
                            </span>
                          </td>
                          <td className="p-4">{row.region}</td>
                          <td className="p-4 font-sans text-[var(--gl-text-muted)]">{row.node_type}</td>
                          <td className="p-4 max-w-[150px] truncate" title={row.parent_node_id || ""}>
                            {row.parent_node_id ? row.parent_node_id.substring(row.parent_node_id.lastIndexOf(":") + 1) : "None"}
                          </td>
                        </>
                      )}

                      {activeTab === "edges" && (
                        <>
                          <td className="p-4 truncate max-w-[150px]">{row.edge_id}</td>
                          <td className="p-4">
                            <span className="flex items-center gap-1.5 max-w-[180px] truncate" title={row.source_arn}>
                              {row.source_arn.substring(row.source_arn.lastIndexOf(":") + 1)}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="flex items-center gap-1.5 max-w-[180px] truncate" title={row.target_arn}>
                              {row.target_arn.substring(row.target_arn.lastIndexOf(":") + 1)}
                            </span>
                          </td>
                          <td className="p-4 font-sans font-semibold text-blue-400">{row.label || "communicates"}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${row.confidence >= 90
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              }`}>
                              {row.confidence}%
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
