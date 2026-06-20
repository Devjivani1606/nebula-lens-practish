// src/components/dashboard/useDashboardStore.ts
// Self-contained dashboard store — lives inside the dashboard folder,
// NOT in @/store/, to keep dashboard components fully isolated.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MockService } from "./data/services";

export type DashboardSection =
  | "overview"
  | "canvas"
  | "blast-radius"
  | "logs"
  | "timeline"
  | "alerts"
  | "cost"
  | "db-explorer"
  | "settings";

interface DashboardState {
  // Layout Panel State
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanel: (open: boolean) => void;
  setRightPanel: (open: boolean) => void;

  // Active Section (controlled by left sidebar nav)
  activeSection: DashboardSection;
  setActiveSection: (section: DashboardSection) => void;

  // Selected Service (from right panel)
  selectedService: MockService | null;
  setSelectedService: (service: MockService | null) => void;

  // Service search in right panel
  serviceSearch: string;
  setServiceSearch: (q: string) => void;

  // AWS Connection state (mock)
  isAwsConnected: boolean;
  awsRegion: string;
  setAwsConnected: (connected: boolean) => void;

  // Alert badge count
  openAlertCount: number;
  setOpenAlertCount: (count: number) => void;

  // Log streaming
  logStreamActive: boolean;
  toggleLogStream: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      // Panel defaults
      leftPanelOpen: true,
      rightPanelOpen: true,
      toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      setLeftPanel: (open) => set({ leftPanelOpen: open }),
      setRightPanel: (open) => set({ rightPanelOpen: open }),

      // Nav
      activeSection: "overview",
      setActiveSection: (section) => set({ activeSection: section, selectedService: null }),

      // Service selection
      selectedService: null,
      setSelectedService: (service) => set({ selectedService: service }),

      // Search
      serviceSearch: "",
      setServiceSearch: (q) => set({ serviceSearch: q }),

      // AWS
      isAwsConnected: true,
      awsRegion: "us-east-1",
      setAwsConnected: (connected) => set({ isAwsConnected: connected }),

      // Alerts
      openAlertCount: 5,
      setOpenAlertCount: (count) => set({ openAlertCount: count }),

      // Logs
      logStreamActive: true,
      toggleLogStream: () => set((s) => ({ logStreamActive: !s.logStreamActive })),
    }),
    {
      name: "gl-dashboard-store",
      partialize: (s) => ({
        leftPanelOpen: s.leftPanelOpen,
        rightPanelOpen: s.rightPanelOpen,
        activeSection: s.activeSection,
        awsRegion: s.awsRegion,
      }),
    }
  )
);
