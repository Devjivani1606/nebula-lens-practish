"use client";

import { useState, useEffect, useMemo } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { 
  Terminal, ArrowsClockwise, Play, CheckCircle, 
  XCircle, Spinner, Clock, IdentificationCard, 
  ListBullets, Info
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface ScanJob {
  id: string;
  account_id: string;
  status: "pending" | "running" | "success" | "failed" | "partial";
  triggered_by: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ServiceScan {
  id: string;
  scan_job_id: string;
  service: string;
  region: string;
  status: "success" | "failed" | "pending";
  resources_found: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

const CHECKLIST_SERVICES = [
  { key: "vpc+subnet", label: "VPC & Subnets" },
  { key: "ec2", label: "EC2 Instances" },
  { key: "lambda", label: "Lambda Functions" },
  { key: "rds", label: "RDS Databases" },
  { key: "sqs", label: "SQS Queues" },
  { key: "apigateway", label: "API Gateway" },
  { key: "eventbridge", label: "EventBridge Rules" },
  { key: "dynamodb", label: "DynamoDB Tables" },
  { key: "ecs", label: "ECS Containers" },
  { key: "sns", label: "SNS Topics" },
  { key: "s3", label: "S3 Buckets (Global)" },
  { key: "cloudfront", label: "CloudFront CDN (Global)" }
];

export default function LogsPage() {
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [serviceScans, setServiceScans] = useState<ServiceScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScanLoading, setIsScanLoading] = useState(false);

  const { 
    connectedAccounts, 
    selectedAccountId, 
    setSelectedAccountId, 
    fetchConnectedAccounts,
    fetchInfrastructure,
    isLoading: storeIsLoading 
  } = useCanvasStore();

  const fetchLogsData = async () => {
    try {
      const [jobsRes, scansRes] = await Promise.all([
        fetch("/api/db/data?table=jobs"),
        fetch("/api/db/data?table=service_scans")
      ]);
      
      if (jobsRes.ok && scansRes.ok) {
        const jobsData = await jobsRes.json();
        const scansData = await scansRes.json();
        setJobs(Array.isArray(jobsData) ? jobsData : []);
        setServiceScans(Array.isArray(scansData) ? scansData : []);
      }
    } catch (e) {
      console.error("Failed to load logs database info:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectedAccounts();
    fetchLogsData();
    
    // Set up polling every 3 seconds to keep progress updated
    const interval = setInterval(fetchLogsData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncAWS = async () => {
    setIsScanLoading(true);
    try {
      // Find the account object to get raw account_id
      const currentAccount = connectedAccounts.find(a => a.id === selectedAccountId);
      const awsAccountId = currentAccount?.account_id;
      
      if (!awsAccountId) {
        alert("Please select a connected AWS Account first in the dropdown.");
        return;
      }

      const res = await fetch(`/api/scan/trigger?account_id=${awsAccountId}`, {
        method: "POST"
      });
      if (res.ok) {
        fetchLogsData();
      } else {
        alert("Failed to queue new scan. Check if background worker is active.");
      }
    } catch (err) {
      console.error("Trigger manual scan error:", err);
    } finally {
      setIsScanLoading(false);
    }
  };

  // Find active running/pending scan jobs
  const activeJob = useMemo(() => {
    return jobs.find(j => j.status === "running" || j.status === "pending") || null;
  }, [jobs]);

  // Map service scan status for the active job
  const activeChecklist = useMemo(() => {
    if (!activeJob) return [];
    
    const activeScans = serviceScans.filter(s => s.scan_job_id === activeJob.id);
    
    return CHECKLIST_SERVICES.map(svc => {
      const match = activeScans.find(s => s.service === svc.key);
      return {
        key: svc.key,
        label: svc.label,
        status: match ? match.status : (activeJob.status === "pending" ? "pending" as const : "running" as const),
        resources: match ? match.resources_found : 0,
        error: match ? match.error_message : null
      };
    });
  }, [activeJob, serviceScans]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--gl-bg-base)]">
      {/* Header bar with controls */}
      <div className="p-8 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--gl-border)] bg-[var(--gl-bg-panel)] shrink-0">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--gl-text-primary)] flex items-center gap-2">
            <Terminal size={24} className="text-indigo-500" />
            Scan Job Logs
          </h1>
          <p className="text-xs text-[var(--gl-text-muted)]">
            Monitor real-time progress and logs of cloud inventory scanning jobs.
          </p>
        </div>

        {/* Account Selector and Sync Buttons */}
        <div className="flex items-center gap-3">
          {connectedAccounts.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--gl-text-muted)]">Account:</span>
              <select
                value={selectedAccountId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAccountId(val || null);
                  setTimeout(() => {
                    fetchInfrastructure();
                  }, 50);
                }}
                className="h-9 px-3 rounded-xl border border-[var(--gl-border)] bg-[var(--gl-bg-base)] text-xs text-[var(--gl-text-secondary)] focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[200px] truncate"
              >
                <option value="">Latest (All Accounts)</option>
                {connectedAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_name} ({account.account_id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            onClick={handleSyncAWS}
            disabled={isScanLoading || storeIsLoading || !selectedAccountId}
            className="h-9 px-4 text-xs font-bold text-white bg-indigo-600 border border-indigo-500/20 hover:bg-indigo-500 rounded-xl flex items-center gap-2 transition-all"
          >
            {(isScanLoading || storeIsLoading) ? (
              <Spinner size={14} className="animate-spin" />
            ) : (
              <Play size={14} weight="fill" />
            )}
            Sync AWS Now
          </Button>

          <Button
            variant="outline"
            onClick={fetchLogsData}
            className="h-9 w-9 p-0 border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] text-[var(--gl-text-secondary)] rounded-xl"
            title="Refresh logs"
          >
            <ArrowsClockwise size={16} />
          </Button>
        </div>
      </div>

      {/* Main split-screen panel */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col lg:flex-row gap-6">
        
        {/* Left Side: Live Console / Checklist */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-[var(--gl-border)] pb-3">
              <div className="flex items-center gap-2">
                <ListBullets size={18} className="text-indigo-400" />
                <h2 className="font-bold text-sm text-[var(--gl-text-primary)]">Live Scan Pipeline Status</h2>
              </div>
              {activeJob ? (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
                  <Spinner className="animate-spin" size={10} />
                  Running (Job ID: {activeJob.id.substring(0, 8)})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Idle (Ready for Scan)
                </span>
              )}
            </div>

            {/* Checklist */}
            {activeJob ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {activeChecklist.map((item) => (
                  <div 
                    key={item.key} 
                    className={`p-3 rounded-xl border flex justify-between items-center transition-all ${
                      item.status === "success" 
                        ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
                        : item.status === "failed"
                        ? "bg-red-500/5 border-red-500/20 text-red-400"
                        : "bg-slate-500/5 border-[var(--gl-border)] text-[var(--gl-text-secondary)]"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-[var(--gl-text-primary)]">{item.label}</span>
                      <span className="text-[10px] text-[var(--gl-text-muted)] font-mono">
                        {item.status === "success" 
                          ? `Found ${item.resources} resources` 
                          : item.status === "failed" 
                          ? "Failed or timed out"
                          : "Waiting..."}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {item.status === "success" && <CheckCircle size={18} className="text-emerald-400" />}
                      {item.status === "failed" && <XCircle size={18} className="text-red-400" />}
                      {item.status !== "success" && item.status !== "failed" && (
                        <Spinner size={18} className="animate-spin text-indigo-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[var(--gl-border)] rounded-xl bg-[var(--gl-bg-muted)]/20">
                <Info size={32} className="text-[var(--gl-text-muted)] mb-3" />
                <p className="text-xs font-semibold text-[var(--gl-text-secondary)] mb-1">No active scan currently running</p>
                <p className="text-[10px] text-[var(--gl-text-muted)] max-w-sm leading-relaxed mb-4">
                  Trigger a scan using the "Sync AWS Now" button above to view the live checklist progress.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Scan History */}
        <div className="w-full lg:w-[450px] flex flex-col gap-6">
          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-2xl p-6 shadow-sm flex flex-col gap-4 h-full overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--gl-border)] pb-3 shrink-0">
              <Clock size={18} className="text-indigo-400" />
              <h2 className="font-bold text-sm text-[var(--gl-text-primary)]">Scan History Logs</h2>
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-[var(--gl-text-muted)] py-12 gap-2">
                <Spinner size={24} className="animate-spin text-indigo-500" />
                Loading history...
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[var(--gl-text-muted)] italic py-12">
                No past scan jobs found.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 max-h-[500px]">
                {jobs.map((job) => (
                  <div 
                    key={job.id} 
                    className="p-4 rounded-xl border border-[var(--gl-border)] bg-[var(--gl-bg-base)]/50 flex flex-col gap-2.5"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-[var(--gl-text-muted)] uppercase tracking-wide">
                          Triggered by {job.triggered_by}
                        </span>
                        <span className="text-xs font-semibold text-[var(--gl-text-primary)] font-mono">
                          Job: {job.id.substring(0, 8)}...
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        job.status === "success" 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : job.status === "failed"
                          ? "bg-red-500/10 text-red-400 border-red-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        {job.status}
                      </span>
                    </div>

                    <div className="text-[10px] text-[var(--gl-text-muted)] flex items-center gap-1">
                      <Clock size={12} />
                      <span>{new Date(job.created_at).toLocaleString()}</span>
                    </div>

                    {job.error_message && (
                      <div className="p-2.5 bg-red-500/5 border border-red-500/10 rounded-lg text-[9px] font-mono text-red-400 max-h-16 overflow-y-auto">
                        {job.error_message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
