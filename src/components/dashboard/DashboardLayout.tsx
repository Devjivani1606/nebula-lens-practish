"use client";

import React from "react";
import { TopHeader } from "./TopHeader";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-[var(--gl-bg-base)]">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 overflow-hidden bg-[var(--gl-bg-surface)]">
          <TopHeader />
          <div className="flex flex-1 overflow-hidden relative">
            <main className="flex-1 overflow-auto bg-[var(--gl-bg-surface)] relative">
              {children}
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
