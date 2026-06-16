'use client';

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useFontScale } from "@/hooks/useFontScale";
import { useFontSizeShortcuts } from "@/hooks/useFontSizeShortcuts";
import "@/styles/font-scale.css";

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  useFontScale(); // Initialize the hook
  const fontToast = useFontSizeShortcuts();

  return (
    <div 
      id="gl-dashboard"
      className="dashboard-wrapper h-full w-full" 
    >
      {fontToast}
      <DashboardLayout>{children}</DashboardLayout>
    </div>
  );
}
