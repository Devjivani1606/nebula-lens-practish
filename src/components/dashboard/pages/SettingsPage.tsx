"use client";
import { FontSizeSelector } from "../FontSizeSelector";

export default function SettingsPage() {
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

        {/* Placeholder for other sections */}
        <section className="flex flex-col gap-4">
           <h2 className="text-[11px] uppercase text-[var(--gl-text-muted)] tracking-[0.7px] font-medium">
            CONNECTION & INTEGRATIONS
          </h2>
          <div className="bg-[var(--gl-bg-panel)] border border-[var(--gl-border)] rounded-xl p-5 shadow-sm text-[var(--gl-text-muted)] text-sm italic">
            AWS connection and scanning schedule configuration coming soon.
          </div>
        </section>
        
      </div>
    </div>
  );
}
