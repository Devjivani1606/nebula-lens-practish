'use client';

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useFontScale } from "@/hooks/useFontScale";
import { useFontSizeShortcuts } from "@/hooks/useFontSizeShortcuts";
import { useDashboardStore } from "@/components/dashboard/useDashboardStore";
import "@/styles/font-scale.css";

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  useFontScale(); // Initialize the hook
  const fontToast = useFontSizeShortcuts();
  const pathname = usePathname();
  const setActiveSection = useDashboardStore((state) => state.setActiveSection);

  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/dashboard") {
      setActiveSection("overview");
    } else {
      const section = pathname.split("/").pop() as any;
      setActiveSection(section);
    }
  }, [pathname, setActiveSection]);

  return (
    <div 
      id="gl-dashboard"
      className="dashboard-wrapper h-full w-full" 
      suppressHydrationWarning
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              var saved = localStorage.getItem('gl-font-scale') || 'small';
              document.getElementById('gl-dashboard').dataset.fontScale = saved;
            } catch (e) {}
          `,
        }}
      />
      {fontToast}
      <DashboardLayout>{children}</DashboardLayout>
    </div>
  );
}
