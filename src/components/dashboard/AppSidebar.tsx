"use client";

import * as React from "react";
import {
  SquaresFour,
  TreeStructure,
  Scroll,
  Clock,
  Gear,
} from "@phosphor-icons/react";
import { NavMain, type NavMainItem } from "./NavMain";
import { NavUser } from "./NavUser";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const MOCK_USER = {
  name: "admin",
  email: "admin@gravity-lens.io",
};

const navigationItems: NavMainItem[] = [
  { title: "Overview", id: "overview", icon: SquaresFour },
  {
    title: "Infrastructure Canvas",
    icon: TreeStructure,
    items: [
      { title: "Structural View", id: "canvas" },
      { title: "Blast Radius", id: "blast-radius" },
      { title: "Cost Topology", id: "cost" },
      { title: "Security Posture", id: "alerts" },
    ],
  },
  { title: "Live Logs", id: "logs", icon: Scroll },
  { title: "Timeline Scrubber", id: "timeline", icon: Clock },
  { title: "Settings", id: "settings", icon: Gear },
];

/** Inner component — needs to live inside SidebarProvider to call useSidebar */
function AppSidebarInner(props: React.ComponentProps<typeof Sidebar>) {
  const { open, setOpen } = useSidebar();

  // Track whether the current open state was triggered by hover (not a user pin-click)
  const hoverOpenedRef = React.useRef(false);
  const enterTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = React.useCallback(() => {
    if (!open) {
      enterTimerRef.current = setTimeout(() => {
        hoverOpenedRef.current = true;
        setOpen(true);
      }, 180);
    }
  }, [open, setOpen]);

  const handleMouseLeave = React.useCallback(() => {
    // Cancel pending expand
    if (enterTimerRef.current) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    // Only auto-collapse if WE opened it via hover
    if (open && hoverOpenedRef.current) {
      hoverOpenedRef.current = false;
      setOpen(false);
    }
  }, [open, setOpen]);

  // If the user manually clicks the toggle while hover-expanded, the sidebar stays open
  // and we should no longer track it as hover-expanded
  React.useEffect(() => {
    if (!open) {
      hoverOpenedRef.current = false;
    }
  }, [open]);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-[var(--gl-border)] bg-[var(--gl-bg-panel)] transition-all"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <SidebarHeader className="border-b border-[var(--gl-border)] px-4 py-3 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-3 flex items-center justify-between group-data-[collapsible=icon]:justify-center">
        <div className="flex items-center gap-2 select-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 w-full">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              <path d="M5.64 5.64l2.83 2.83M15.54 15.54l2.83 2.83M5.64 18.36l2.83-2.83M15.54 8.46l2.83-2.83" />
            </svg>
          </div>
          <span className="text-sm font-bold text-[var(--gl-text-primary)] tracking-tight group-data-[collapsible=icon]:hidden">
            Gravity<span className="aurora-text">Lens</span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 mt-2">
        <NavMain items={navigationItems} />
      </SidebarContent>

      <SidebarFooter className="border-t border-[var(--gl-border)] p-2">
        <NavUser user={MOCK_USER} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return <AppSidebarInner {...props} />;
}
