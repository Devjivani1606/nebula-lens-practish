'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useFontScale } from './useFontScale';

export function useFontSizeShortcuts() {
  const pathname = usePathname();
  const { scale, increase, decrease, setScale } = useFontScale();
  const [toast, setToast] = useState<{ message: string; isLimit: boolean; id: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Test log to verify what usePathname returns
    console.log('current path:', pathname);

    const DASHBOARD_PATHS = ['/', '/overview', '/settings', '/live-logs', '/timeline-scrubber', '/dashboard'];
    // Assuming pathname typically starts with '/dashboard' based on the project structure
    // We should be lenient with dashboard paths. If the user provided an exact list, let's use it but also allow '/dashboard' prefixes.
    const isDashboard = DASHBOARD_PATHS.some(p => pathname === p || pathname?.startsWith(p));
    if (!isDashboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Temporary test log to verify listener is firing
      console.log('shortcut fired', e.key, 'meta:', e.metaKey, 'ctrl:', e.ctrlKey);

      const isMod = e.metaKey || e.ctrlKey;
      if (isMod) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          if (scale === 'large') {
            showToast('Text size: Largest (limit reached)', true);
          } else {
            increase();
            const nextScale = scale === 'small' ? 'Medium' : 'Large';
            showToast(`Text size: ${nextScale}`, false);
          }
        } else if (e.key === '-') {
          e.preventDefault();
          if (scale === 'small') {
            showToast('Text size: Smallest (limit reached)', true);
          } else {
            decrease();
            const nextScale = scale === 'large' ? 'Medium' : 'Small';
            showToast(`Text size: ${nextScale}`, false);
          }
        } else if (e.key === '0') {
          e.preventDefault();
          setScale('medium');
          showToast('Text size: Medium', false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pathname, scale, increase, decrease, setScale]);

  const showToast = (message: string, isLimit: boolean) => {
    setToast({ message, isLimit, id: Date.now() });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 1200); // visible for 1200ms
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const ToastComponent = (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }} // fadeOut 200ms
          transition={{
            duration: 0.15, // fadeIn 150ms
          }}
          className="fixed z-50 pointer-events-none"
          style={{ top: '16px', right: '16px' }}
        >
          <div
            className={`px-3 py-1 text-xs border-[0.5px] border-[var(--border)] rounded-full bg-[var(--card)] shadow-lg ${
              toast.isLimit ? 'text-[var(--muted-foreground)]' : 'text-[var(--foreground)]'
            }`}
          >
            {toast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return ToastComponent;
}
