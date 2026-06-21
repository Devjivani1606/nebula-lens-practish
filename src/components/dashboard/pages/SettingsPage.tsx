
"use client";
import React, { useState, useEffect } from "react";
import { FontSizeSelector } from "../FontSizeSelector";

interface AwsAccount {
  id: string;
  account_id: string;
  account_name: string | null;
  role_arn: string;
  status: string;
  created_at: string;
}

export default function SettingsPage() {
  const [roleArn, setRoleArn] = useState("");
  const [accountName, setAccountName] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const [accounts, setAccounts] = useState<AwsAccount[]>([]);
  const [fetchingAccounts, setFetchingAccounts] = useState(true);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ text: string; isError: boolean } | null>(null);

  // Fetch connected accounts on mount
  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/aws/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setFetchingAccounts(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleArn.trim()) {
      setStatusMessage({ text: "Please enter a valid IAM Role ARN.", isError: true });
      return;
    }

    setSubmitLoading(true);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/aws/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_arn: roleArn.trim(),
          account_name: accountName.trim() || null,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusMessage({ text: data.message, isError: false });
        setRoleArn("");
        setAccountName("");
        // Reload list
        fetchAccounts();
      } else {
        setStatusMessage({ text: data.detail || data.message || "Failed to link AWS account.", isError: true });
      }
    } catch (error) {
      console.error("Connect error:", error);
      setStatusMessage({ text: "Failed to connect to the backend service. Check if backend is running.", isError: true });
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!window.confirm("Are you absolutely sure you want to delete all database data? This will clear all connected accounts and snapshots.")) {
      return;
    }

    setResetLoading(true);
    setResetStatus(null);

    try {
      const res = await fetch("/api/aws/reset", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResetStatus({ text: data.message, isError: false });
        fetchAccounts();
        try {
          const { fetchConnectedAccounts, setSelectedAccountId, fetchInfrastructure } = (await import("../../../store/useCanvasStore")).useCanvasStore.getState();
          setSelectedAccountId(null);
          fetchConnectedAccounts();
          fetchInfrastructure();
        } catch (storeErr) {
          console.error("Failed to update canvas store:", storeErr);
        }
      } else {
        setResetStatus({ text: data.error || "Failed to reset database.", isError: true });
      }
    } catch (error) {
      console.error("Reset error:", error);
      setResetStatus({ text: "Failed to connect to the backend service.", isError: true });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-8 pb-4 flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--gl-text-primary)]">Settings</h1>
        <p className="text-[var(--gl-text-muted)]">Manage your preferences, account details, and appearance settings.</p>
      </div>

      <div className="px-8 py-6 max-w-3xl flex flex-col gap-10">

        {/* Appearance Section */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase text-[var(--gl-text-muted)] tracking-[0.7px] font-medium">
            TEXT SIZE
          </h2>

          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-5 flex flex-col gap-6 shadow-sm">
            <div className="flex justify-between items-start gap-4">
              <div className="flex flex-col gap-1.5">
                <h3 className="font-medium text-[var(--gl-text-primary)]">Dashboard Font Scale</h3>
                <p className="text-sm text-[var(--gl-text-muted)] leading-relaxed">
                  Adjust the size of text across the dashboard. This affects metrics, tables, and navigation, but does not affect the infrastructure canvas.
                </p>
              </div>
              <div className="shrink-0 bg-[var(--gl-bg-panel)] rounded-xl border border-[var(--gl-border)] p-1.5 shadow-sm">
                <FontSizeSelector layoutIdPrefix="settings-font" />
              </div>
            </div>

            <div className="p-4 bg-[var(--gl-bg-muted)] border border-[var(--gl-border)] rounded-lg flex flex-col items-center justify-center min-h-[100px] text-center">
              <span className="text-[var(--gl-text-muted)] text-[10px] uppercase font-bold tracking-wider mb-2">Live Preview</span>
              <p className="text-[var(--gl-text-base)] font-medium text-[var(--gl-text-primary)]">
                Sample dashboard text at this size
              </p>
            </div>
          </div>
        </section>

        {/* AWS Integrations & Connectors Section */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase text-[var(--gl-text-muted)] tracking-[0.7px] font-medium">
            AWS CONNECTION & INTEGRATIONS
          </h2>

          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-6 flex flex-col gap-6 shadow-sm">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold text-base text-[var(--gl-text-primary)]">Connect new AWS Account</h3>
              <p className="text-xs text-[var(--gl-text-muted)]">
                Provide a cross-account IAM Role ARN with read-only permissions for Gravity Lens to discover cloud assets.
              </p>
            </div>

            <form onSubmit={handleConnect} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--gl-text-primary)]">Role ARN</label>
                  <input
                    type="text"
                    value={roleArn}
                    onChange={(e) => setRoleArn(e.target.value)}
                    placeholder="arn:aws:iam::618642320905:role/GravityLenseROle"
                    className="px-3.5 py-2.5 rounded-lg border border-[var(--gl-border)] bg-[var(--gl-bg-base)] text-sm text-[var(--gl-text-primary)] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--gl-border)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--gl-text-primary)]">Account Name (Optional)</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Production Cloud"
                    className="px-3.5 py-2.5 rounded-lg border border-[var(--gl-border)] bg-[var(--gl-bg-base)] text-sm text-[var(--gl-text-primary)] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--gl-border)]"
                  />
                </div>
              </div>

              {statusMessage && (
                <div
                  className={`p-3.5 rounded-lg border text-xs font-medium ${
                    statusMessage.isError
                      ? "bg-red-500/10 border-red-500/20 text-red-400"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full md:w-auto self-start px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-colors duration-200 disabled:opacity-50"
              >
                {submitLoading ? "Verifying & Connecting..." : "Connect Account & Trigger Scan"}
              </button>
            </form>
          </div>
        </section>

        {/* Connected Accounts List */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase text-[var(--gl-text-muted)] tracking-[0.7px] font-medium">
            CONNECTED AWS ACCOUNTS
          </h2>

          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl overflow-hidden shadow-sm">
            {fetchingAccounts ? (
              <div className="p-6 text-center text-xs text-[var(--gl-text-muted)]">Loading accounts...</div>
            ) : accounts.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--gl-text-muted)] italic">
                No AWS accounts connected yet. Use the form above to link one.
              </div>
            ) : (
              <div className="divide-y divide-[var(--gl-border)]">
                {accounts.map((acc) => (
                  <div key={acc.id} className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--gl-bg-panel)]">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-sm text-[var(--gl-text-primary)]">
                        {acc.account_name || `AWS Account ${acc.account_id}`}
                      </span>
                      <span className="text-[10px] text-[var(--gl-text-muted)] font-mono">{acc.role_arn}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        acc.status === "active"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}>
                        {acc.status}
                      </span>
                      <span className="text-[10px] text-[var(--gl-text-muted)]">
                        Connected: {new Date(acc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Danger Zone Section */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[11px] uppercase text-red-400 tracking-[0.7px] font-medium">
            DANGER ZONE
          </h2>

          <div className="bg-[var(--gl-bg-panel)] border border-red-500/20 rounded-xl p-6 flex flex-col gap-6 shadow-sm">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold text-base text-[var(--gl-text-primary)]">Reset Database</h3>
              <p className="text-xs text-[var(--gl-text-muted)]">
                Permanently erase all AWS accounts, snapshots, normalized nodes, and relationships from the database. This action is irreversible.
              </p>
            </div>

            <div>
              {resetStatus && (
                <div
                  className={`p-3.5 mb-4 rounded-lg border text-xs font-medium ${
                    resetStatus.isError
                      ? "bg-red-500/10 border-red-500/20 text-red-400"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  }`}
                >
                  {resetStatus.text}
                </div>
              )}

              <button
                type="button"
                onClick={handleResetDatabase}
                disabled={resetLoading}
                className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium text-xs shadow-sm transition-colors duration-200 disabled:opacity-50"
              >
                {resetLoading ? "Erasing Database..." : "Reset Database & Clear All Data"}
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
