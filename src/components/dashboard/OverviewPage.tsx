"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HardDrives, CurrencyDollar, Warning,
  Clock, GitBranch, Globe, ArrowUpRight, ArrowDownRight,
  Minus, ArrowsClockwise, Eye, Scroll, ClockCounterClockwise, CheckCircle
} from "@phosphor-icons/react";
import { MOCK_SERVICES } from "./data/services";
import { MOCK_ALERTS } from "./data/alerts";
import { MOCK_SNAPSHOTS } from "./data/snapshots";
import { useRouter } from "next/navigation";
import { staggerContainer, staggerItem } from "../../lib/motion";
import { useRelativeTime } from "../../hooks/useRelativeTime";
import { Sparkline } from "./Sparkline";
import { getContextualGreeting } from "../../lib/greetings";

/* ──────────────── Compact Stat Card (Row 2) ──────────────── */
interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  sparklineData?: number[];
  sparklineColor?: string;
}

function CompactStatCard({
  title, value, sub, icon: Icon,
  iconColor, trend, trendValue,
  sparklineData, sparklineColor,
}: StatCardProps) {
  return (
    <motion.div
      variants={staggerItem}
      className="bg-[var(--card)] p-4 rounded-xl border-none shadow-none flex flex-col justify-center gap-2 transition-colors hover:bg-[var(--accent)] cursor-pointer"
    >
      <div className="flex items-center gap-2">
        <Icon size={18} style={{ color: iconColor }} />
        <span className="text-[11px] font-medium text-[var(--gl-text-muted)] leading-tight">{title}</span>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <div className="text-lg font-medium text-[var(--gl-text-primary)] leading-none tracking-tight flex items-center gap-3">
            {title === "Last Scan" ? (
              <AnimatePresence mode="wait">
                <motion.span
                  key={value}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {value}
                </motion.span>
              </AnimatePresence>
            ) : (
              value
            )}
            {sparklineData && sparklineColor && (
              <Sparkline data={sparklineData} color={sparklineColor} />
            )}
          </div>
          {sub && (
            <p className="text-[10px] font-medium text-[var(--gl-text-muted)] mt-1">{sub}</p>
          )}
        </div>
        {trend && trendValue && (
          <div className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${trend === "up" ? "text-red-400 bg-red-500/10"
              : trend === "down" ? "text-emerald-400 bg-emerald-500/10"
                : "text-[var(--gl-text-muted)] bg-[var(--gl-bg-muted)]"
            }`}>
            {trend === "up" ? <ArrowUpRight size={10} /> :
              trend === "down" ? <ArrowDownRight size={10} /> :
                <Minus size={10} />}
            {trendValue}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ──────────────── Health Ring ──────────────── */
function HealthRing({ score, size = 140 }: { score: number, size?: number }) {
  const strokeWidth = size > 100 ? 8 : 5;
  const center = size / 2;
  const r = center - strokeWidth - 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "#10B981" : score >= 60 ? "#F59E0B" : "#EF4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={center} cy={center} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
        />
      </svg>
    </div>
  );
}

/* ──────────────── Activity Feed ──────────────── */
const RECENT_ACTIVITY = [
  { time: "2m ago", icon: ArrowsClockwise, color: "#6366F1", msg: "Auto-scan completed — 12 resources mapped" },
  { time: "14m ago", icon: Warning, color: "#F59E0B", msg: "Lambda error rate above 2% threshold" },
  { time: "1h ago", icon: GitBranch, color: "#10B981", msg: "Snapshot v1.3.1 saved — 1 new resource" },
  { time: "2h ago", icon: Warning, color: "#EF4444", msg: "CloudFront 503 errors detected (5.8%)" },
  { time: "3h ago", icon: CurrencyDollar, color: "#A855F7", msg: "Cost anomaly: Lambda 18% above baseline" },
];

/* ──────────────── Region Map (text-based) ──────────────── */
const REGIONS = [
  { name: "ap-south-a1", label: "Mumbai", count: 10, color: "#6366F1" },
  { name: "global", label: "Global", count: 2, color: "#14B8A6" },
];

/* ──────────────── Animation Variants ──────────────── */
const activityContainer = {
  animate: {
    transition: {
      staggerChildren: 0.06,
    }
  }
};

const activityItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" as const } }
};

const quickActionVariants = {
  hover: {
  }
};

const iconVariants = {
  hover: {
    x: 2,
    transition: { duration: 0.1 }
  }
};

/* ──────────────── Overview Page ──────────────── */
export default function OverviewPage() {
  const router = useRouter();
  const [scanTime] = useState(() => new Date(Date.now() - 120000));
  const lastScanText = useRelativeTime(scanTime);

  // Scan Button State
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "done">("idle");
  const [scanProgress, setScanProgress] = useState(0);

  const handleScan = () => {
    if (scanStatus !== "idle") return;
    setScanStatus("scanning");
    setScanProgress(0);

    // TODO: Connect to real scan progress/websocket
    let currentProgress = 0;
    const intervalId = setInterval(() => {
      currentProgress += 1;
      setScanProgress(currentProgress);

      if (currentProgress >= 12) {
        clearInterval(intervalId);
        setScanStatus("done");
        setTimeout(() => {
          setScanStatus("idle");
          setScanProgress(0);
        }, 800);
      }
    }, 150);
  };

  const totalServices = MOCK_SERVICES.length;
  const monthlyCost = MOCK_SERVICES.reduce((acc, s) => acc + s.cost, 0);
  const openAlerts = MOCK_ALERTS.filter((a) => a.status === "open").length;
  const criticalAlerts = MOCK_ALERTS.filter((a) => a.severity === "critical" && a.status === "open").length;
  const highAlerts = MOCK_ALERTS.filter((a) => a.severity === "high" && a.status === "open").length;

  const healthyCount = MOCK_SERVICES.filter((s) => s.status === "healthy").length;
  const healthScore = Math.round((healthyCount / totalServices) * 100);
  const currentSnap = MOCK_SNAPSHOTS[MOCK_SNAPSHOTS.length - 1];
  const recentChanges = MOCK_SNAPSHOTS.slice(-3).reduce((acc, s) => acc + s.changes.length, 0);

  const { message: greetingMsg, colorClass: greetingColor } = getContextualGreeting({
    criticalAlerts,
    healthScore,
  });

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">

      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-medium text-[var(--gl-text-primary)] tracking-tight">
            Infrastructure <span className="aurora-text">Overview</span>
          </h1>

          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`text-sm font-medium mt-1 ${greetingColor}`}
          >
            {greetingMsg}
          </motion.div>

          <div className="text-[11px] font-medium text-[var(--gl-text-muted)] mt-1 flex items-center gap-1">
            <span>{currentSnap.version} · Last scanned </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={lastScanText}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {lastScanText}
              </motion.span>
            </AnimatePresence>
            <span> · {currentSnap.totalResources} resources tracked</span>
          </div>
        </div>

        <motion.button
          layout
          disabled={scanStatus !== "idle"}
          whileHover={scanStatus === "idle" ? { scale: 1.02 } : {}}
          whileTap={scanStatus === "idle" ? { scale: 0.97 } : {}}
          onClick={handleScan}
          className="relative overflow-hidden flex items-center justify-center px-4 py-2 rounded-lg text-xs font-medium bg-[rgba(99,102,241,0.12)] text-indigo-400 border border-[rgba(99,102,241,0.25)] hover:bg-[rgba(99,102,241,0.18)] transition-colors min-w-[110px]"
        >
          {scanStatus === "scanning" && (
            <motion.div
              className="absolute bottom-0 left-0 h-[2px] bg-indigo-400/40"
              initial={{ width: "0%" }}
              animate={{ width: `${(scanProgress / 12) * 100}%` }}
              transition={{ ease: "linear", duration: 0.15 }}
            />
          )}
          
          <AnimatePresence mode="wait">
            {scanStatus === "idle" && (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <ArrowsClockwise size={14} />
                <span>Scan Now</span>
              </motion.div>
            )}
            
            {scanStatus === "scanning" && (
              <motion.div 
                key="scanning"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                >
                  <ArrowsClockwise size={14} />
                </motion.div>
                <span className="tabular-nums">Scanning... {scanProgress}/12</span>
              </motion.div>
            )}

            {scanStatus === "done" && (
              <motion.div 
                key="done"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <CheckCircle size={14} />
                <span>Done</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      {/* ROW 1: Hero Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Health Score Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="gl-card border border-[var(--border)] shadow-sm p-6 flex flex-col md:flex-row items-center gap-8 md:col-span-3"
        >
          <div className="relative shrink-0">
            <HealthRing score={healthScore} size={140} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[40px] font-medium font-sans tracking-tight" style={{ color: healthScore >= 80 ? "#10B981" : healthScore >= 60 ? "#F59E0B" : "#EF4444" }}>
                {healthScore}%
              </span>
            </div>
          </div>
          <div className="flex-1 text-center md:text-left">
            <h2 className="text-sm font-medium text-[var(--gl-text-muted)] uppercase tracking-wider mb-2">System Health</h2>
            <p className="text-[13px] text-[var(--gl-text-muted)] mb-3">
              {healthyCount}/{totalServices} services healthy
            </p>
            <div className="flex flex-wrap justify-center md:justify-start gap-2">
              {MOCK_SERVICES.filter(s => s.status !== "healthy").map(s => (
                <span key={s.id} className="text-[11px] px-2 py-1 rounded bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]">
                  {s.name.split("-").slice(-1)[0]}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Open Alerts Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="gl-card border border-[var(--border)] shadow-sm p-6 flex flex-col justify-center md:col-span-2"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${openAlerts > 0 ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
              {openAlerts > 0 ? <Warning size={18} className="text-red-400" /> : <CheckCircle size={18} className="text-emerald-400" />}
            </div>
            <h2 className="text-sm font-medium text-[var(--gl-text-muted)] uppercase tracking-wider">Open Alerts</h2>
          </div>
          <div className="mt-2 min-h-[64px] flex flex-col justify-center">
            {openAlerts > 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <div className="flex items-center gap-4 mb-2">
                  <div className="text-[40px] font-medium leading-none text-[var(--gl-text-primary)]">
                    {openAlerts}
                  </div>
                  <Sparkline data={[15, 13, 14, 11, 9, 6, 2]} color="#10B981" width={64} height={20} />
                </div>
                {criticalAlerts > 0 ? (
                  <p className="text-[13px]">
                    <span className="text-red-400 font-medium">{criticalAlerts} critical</span>
                    <span className="text-[var(--gl-text-muted)]">, {highAlerts} high</span>
                  </p>
                ) : (
                  <p className="text-[13px] text-[var(--gl-text-muted)]">{highAlerts} high alerts</p>
                )}
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle size={32} />
                  <span className="text-2xl font-medium tracking-tight">All clear</span>
                </div>
                <p className="text-[13px] text-[var(--gl-text-muted)]">No active issues</p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ROW 2: Compact Stats Strip */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 md:grid-cols-5 gap-3"
      >
        <CompactStatCard title="Total Services" value={totalServices}
          icon={HardDrives} iconColor="#6366F1" iconBg="rgba(99,102,241,0.12)" />
        <CompactStatCard title="Monthly Cost" value={`$${monthlyCost.toFixed(0)}`} sub="est. this month"
          icon={CurrencyDollar} iconColor="#10B981" iconBg="rgba(16,185,129,0.12)" trend="up" trendValue="+18%"
          sparklineData={[1120, 1150, 1180, 1200, 1190, 1250, 1280]} sparklineColor="#6366F1" />
        <CompactStatCard title="Last Scan" value={lastScanText} sub="Next in 22 min"
          icon={Clock} iconColor="#06B6D4" iconBg="rgba(6,182,212,0.12)" />
        <CompactStatCard title="Recent Changes" value={recentChanges} sub="past 48 hours"
          icon={GitBranch} iconColor="#A855F7" iconBg="rgba(168,85,247,0.12)" />
        <CompactStatCard title="Regions" value={REGIONS.length} sub="us-east-1 + global"
          icon={Globe} iconColor="#14B8A6" iconBg="rgba(20,184,166,0.12)" />
      </motion.div>

      {/* ROW 3: Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
        className="gl-card p-4 border border-[var(--border)] shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-[var(--gl-text-primary)] uppercase tracking-wider">
            Recent Activity
          </p>
          <div className="flex items-center gap-1 text-[10px] text-[var(--gl-text-muted)]">
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            />
            Live
          </div>
        </div>

        <motion.div
          variants={activityContainer}
          initial="initial"
          animate="animate"
          className="space-y-0"
        >
          {RECENT_ACTIVITY.length > 0 ? (
            RECENT_ACTIVITY.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  variants={activityItem}
                  className="flex items-start gap-2.5 py-2 border-b border-[var(--gl-border)] last:border-0"
                >
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${item.color}18` }}>
                    <Icon size={14} style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[var(--gl-text-secondary)] leading-snug">{item.msg}</p>
                  </div>
                  <span className="text-[9px] text-[var(--gl-text-muted)] font-sans font-medium whitespace-nowrap">{item.time}</span>
                </motion.div>
              );
            })
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-8 text-[var(--gl-text-muted)] gap-2"
            >
              <ClockCounterClockwise size={24} weight="light" opacity={0.5} />
              <p className="text-xs font-medium">No recent activity</p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* ROW 4: Quick Actions + Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="gl-card bg-[var(--card)] p-5 border-none shadow-none"
        >
          <p className="text-xs font-medium text-[var(--gl-text-primary)] uppercase tracking-wider mb-3">
            Quick Actions
          </p>
          <div className="space-y-2">
            {[
              { label: "View Infrastructure Canvas", icon: Eye, section: "canvas", color: "#6366F1" },
              { label: "Explore Timeline", icon: ClockCounterClockwise, section: "timeline", color: "#A855F7" },
              { label: "Review Alerts", icon: Warning, section: "alerts", color: "#EF4444" },
            ].map(({ label, icon: Icon, section, color }) => (
              <motion.button
                key={section}
                whileHover="hover"
                variants={quickActionVariants}
                onClick={() => router.push(`/dashboard/${section}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--gl-text-secondary)] hover:text-[var(--gl-text-primary)] hover:bg-[var(--accent)] transition-all group"
              >
                <motion.div variants={iconVariants}>
                  <Icon size={14} className="shrink-0" style={{ color }} />
                </motion.div>
                {label}
                <ArrowUpRight size={12} className="ml-auto opacity-0 group-hover:opacity-50 transition-opacity" />
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Regions + Service Type Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="gl-card bg-[var(--card)] p-5 lg:col-span-2 border-none shadow-none"
        >
          <p className="text-xs font-medium text-[var(--gl-text-primary)] uppercase tracking-wider mb-3">
            Resources by Region
          </p>
          <div className="space-y-2">
            {REGIONS.length === 1 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 py-1"
              >
                <Globe size={18} style={{ color: REGIONS[0].color }} />
                <span className="text-sm font-medium text-[var(--gl-text-primary)]">
                  {REGIONS[0].count} resources mapped in {REGIONS[0].label}
                </span>
              </motion.div>
            ) : (
              REGIONS.map((r, i) => (
                <div key={r.name} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-32 shrink-0">
                    <Globe size={14} style={{ color: r.color }} />
                    <span className="text-[10px] font-sans font-medium text-[var(--gl-text-secondary)]">{r.label}</span>
                  </div>
                  <div className="flex-1 h-1.5 bg-[var(--gl-bg-muted)] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: r.color, opacity: 0.7 }}
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.count / totalServices) * 100}%` }}
                      transition={{ delay: 0.3 + i * 0.3, duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                  <span className="text-[10px] font-sans font-medium text-[var(--gl-text-muted)] w-6 text-right">{r.count}</span>
                </div>
              ))
            )}
          </div>

          {/* Service type grid */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { type: "Lambda", count: 2, color: "#EC4899" },
              { type: "S3", count: 2, color: "#10B981" },
              { type: "RDS", count: 1, color: "#06B6D4" },
              { type: "EC2", count: 1, color: "#F59E0B" },
              { type: "API GW", count: 1, color: "#8B5CF6" },
              { type: "SQS", count: 1, color: "#F97316" },
              { type: "DynamoDB", count: 1, color: "#3B82F6" },
              { type: "CloudFront", count: 1, color: "#14B8A6" },
            ].map(({ type, count, color }) => (
              <div key={type} className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2 text-center">
                <p className="text-[10px] font-medium font-sans text-[var(--primary)]">{count}</p>
                <p className="text-[8px] text-[var(--muted-foreground)] mt-0.5 leading-tight">{type}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
