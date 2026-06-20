"use client";

import React from "react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import {
  Sun, Moon, Bell, CaretRight,
  WifiHigh, WifiSlash, SidebarSimple,
  ArrowsClockwise, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDashboardStore } from "./useDashboardStore";
import type { DashboardSection } from "./useDashboardStore";
import { useSidebar } from "@/components/ui/sidebar";
import { useCanvasStore } from "../../store/useCanvasStore";
import { Separator } from "@/components/ui/separator";
import { FontSizeControl } from "./FontSizeControl";

const SECTION_LABELS: Record<DashboardSection, string> = {
  overview: "Overview",
  canvas: "Infrastructure Canvas",
  "blast-radius": "Blast Radius",
  timeline: "Timeline",
  alerts: "Alerts",
  cost: "Cost Analysis",
  "db-explorer": "Database Explorer",
  settings: "Settings",
  logs: ""
};

export function TopHeader() {
  const { theme, setTheme } = useTheme();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const leftPanelOpen = sidebarState === "expanded";
  const {
    activeSection, openAlertCount,
    isAwsConnected, awsRegion,
  } = useDashboardStore();
//test
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false);
  const isLoading = useCanvasStore((state) => state.isLoading);
  const fetchInfrastructure = useCanvasStore((state) => state.fetchInfrastructure);
  const setTourActive = useCanvasStore((state) => state.setTourActive);
  const connectedAccounts = useCanvasStore((state) => state.connectedAccounts);
  const selectedAccountId = useCanvasStore((state) => state.selectedAccountId);
  const setSelectedAccountId = useCanvasStore((state) => state.setSelectedAccountId);
  const fetchConnectedAccounts = useCanvasStore((state) => state.fetchConnectedAccounts);

  React.useEffect(() => {
    fetchConnectedAccounts();
  }, [fetchConnectedAccounts]);

  const replayTour = () => {
    localStorage.removeItem('gravity-lens-tour-complete');
    setTourActive(true);
    window.dispatchEvent(new CustomEvent('replay-tour'));
  };

  return (
    <header className="flex items-center h-14 px-4 gap-3 border-b border-[var(--gl-border)] bg-[var(--gl-bg-panel)] shrink-0 z-40">

      {/* Left Panel Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost" size="icon"
              onClick={toggleSidebar}
              className="h-8 w-8 text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)] hover:bg-[var(--gl-bg-muted)]"
            />
          }
        >
          <SidebarSimple size={16} />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {leftPanelOpen ? "Collapse sidebar" : "Expand sidebar"}
        </TooltipContent>
      </Tooltip>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs hidden sm:flex">
        <span className="text-[var(--gl-text-muted)]">Dashboard</span>
        <CaretRight size={12} className="text-[var(--gl-text-disabled)]" />
        <span className="text-[var(--gl-text-primary)] font-medium">
          {SECTION_LABELS[activeSection]}
        </span>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* AWS Account Selector Dropdown */}
      {connectedAccounts.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--gl-text-muted)] hidden lg:inline">Account:</span>
          <select
            value={selectedAccountId || ""}
            onChange={async (e) => {
              const val = e.target.value;
              setSelectedAccountId(val || null);
              // Wait for state to apply then fetch
              setTimeout(() => {
                fetchInfrastructure();
              }, 50);
            }}
            className="h-8 px-2 rounded-lg border border-[var(--gl-border)] bg-[var(--gl-bg-panel)] text-xs text-[var(--gl-text-secondary)] focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[200px] truncate"
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

      {/* Sync Infrastructure */}
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="outline"
          onClick={() => fetchInfrastructure()}
          disabled={isLoading}
          className="h-8 px-3 text-xs font-bold text-[var(--gl-text-secondary)] border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] hover:text-[var(--gl-text-primary)]"
        >
          <ArrowsClockwise weight="bold" className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          {isLoading ? 'Scanning...' : 'Sync AWS'}
        </Button>
      </motion.div>

      {/* Product Tour Recap */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost" size="icon"
              onClick={replayTour}
              className="h-8 w-8 text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)] hover:bg-[var(--gl-bg-muted)]"
            />
          }
        >
          <ArrowCounterClockwise size={16} />
        </TooltipTrigger>
        <TooltipContent side="bottom">Replay Tour</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-5 mx-1 bg-[var(--gl-border)]" />

      {/* AWS Connection Status */}
      <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--gl-bg-muted)] border border-[var(--gl-border)] text-xs">
        {isAwsConnected ? (
          <>
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            />
            <span className="text-[var(--gl-text-secondary)] font-mono">{awsRegion}</span>
          </>
        ) : (
          <>
            <WifiSlash size={12} className="text-red-400" />
            <span className="text-red-400">Disconnected</span>
          </>
        )}
      </div>

      <FontSizeControl />

      {/* Alerts Bell (Detailed Dropdown) */}
      <div className="relative">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost" size="icon"
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={`h-8 w-8 relative text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)] hover:bg-[var(--gl-bg-muted)] ${isNotificationsOpen ? 'bg-[var(--gl-bg-muted)] text-[var(--gl-text-primary)]' : ''}`}
              />
            }
          >
            <motion.div whileHover={{ rotate: [0, -15, 15, -15, 0] }} transition={{ duration: 0.4 }}>
              <Bell size={16} weight={isNotificationsOpen ? "fill" : "regular"} />
            </motion.div>
            {openAlertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-1 ring-[var(--gl-bg-panel)] animate-pulse" />
            )}
          </TooltipTrigger>
          <TooltipContent side="bottom">Notifications</TooltipContent>
        </Tooltip>

        {isNotificationsOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute top-full right-0 mt-2 w-80 bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl shadow-xl overflow-hidden z-[100]"
          >
            <div className="p-3 border-b border-[var(--gl-border)] flex justify-between items-center bg-[var(--gl-bg-muted)]">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--gl-text-secondary)]">Notifications</span>
              <span className="text-[9px] font-bold text-blue-400 cursor-pointer hover:underline">Mark all as read</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {/* Mock alerts */}
              <div className="p-4 border-b border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] cursor-pointer transition-colors">
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[var(--gl-text-primary)]">High Latency: Ingress API</p>
                    <p className="text-[10px] text-[var(--gl-text-secondary)] mt-1 leading-relaxed">Average response time exceeded 60ms threshold across 3 AZs.</p>
                    <p className="text-[9px] font-bold text-[var(--gl-text-muted)] mt-2 uppercase tracking-widest">2 mins ago</p>
                  </div>
                </div>
              </div>
              <div className="p-4 border-b border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] cursor-pointer transition-colors">
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[var(--gl-text-primary)]">Cost Spike Detected</p>
                    <p className="text-[10px] text-[var(--gl-text-secondary)] mt-1 leading-relaxed">MongoDB Atlas projected cost increased by 15% due to high IOPS.</p>
                    <p className="text-[9px] font-bold text-[var(--gl-text-muted)] mt-2 uppercase tracking-widest">1 hour ago</p>
                  </div>
                </div>
              </div>
              <div className="p-4 hover:bg-[var(--gl-bg-muted)] cursor-pointer transition-colors">
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[var(--gl-text-primary)]">Deployment Successful</p>
                    <p className="text-[10px] text-[var(--gl-text-secondary)] mt-1 leading-relaxed">VPC configuration updated automatically.</p>
                    <p className="text-[9px] font-bold text-[var(--gl-text-muted)] mt-2 uppercase tracking-widest">3 hours ago</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Theme Toggle */}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost" size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 w-8 text-[var(--gl-text-muted)] hover:text-[var(--gl-text-primary)] hover:bg-[var(--gl-bg-muted)]"
            />
          }
        >
          <Sun  size={16} className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon size={16} className="rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 absolute" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Toggle theme</TooltipContent>
      </Tooltip>

      {/* Divider */}
      <div className="w-px h-5 bg-[var(--gl-border)]" />

      {/* User Avatar */}
      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7 ring-1 ring-[var(--gl-border)]">
          <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold">
            GL
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium text-[var(--gl-text-secondary)] hidden lg:block">
          admin
        </span>
      </div>

    </header>
  );
}
