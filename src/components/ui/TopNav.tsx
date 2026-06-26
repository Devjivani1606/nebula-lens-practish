'use client';

import { useEffect, useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudIcon, ArrowsClockwiseIcon, BellIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { Button } from "./button";
import { Badge } from "./badge";
import { Separator } from "./separator";
import Image from 'next/image';
import { ThemeToggle } from './ToggleButton';
export default function TopNav() {
  const isLoading = useCanvasStore((state) => state.isLoading);
  const fetchInfrastructure = useCanvasStore((state) => state.fetchInfrastructure);
  const setTourActive = useCanvasStore((state) => state.setTourActive);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const replayTour = () => {
    localStorage.removeItem('gravity-lens-tour-complete');
    setTourActive(true);
    window.dispatchEvent(new CustomEvent('replay-tour'));
  };

  return (
    <header data-tour-id="top-nav" className="flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-50">

      {/* Left: Branding & Logo */}
      <div className="flex items-center gap-3">

  {/* 1. THE LOGO FIX */}
  <div className="flex items-center justify-center shrink-0 overflow-hidden rounded-xl bg-[#0A0A0A] shadow-sm ring-1 ring-white/10">
    <Image
      src="/logo/singleLogo.svg"
      alt="Gravity Lens Logo"
      width={36}
      height={36}
      className="object-contain"
      priority
    />
  </div>

  {/* 2. THE TYPOGRAPHY & NEW BADGE */}
  <div className="flex items-center gap-2.5">
    <span className="font-black text-xl text-slate-800 dark:text-slate-100 tracking-tight">
      Gravity Lens
    </span>

    <Badge
      variant="secondary"
      className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/50 dark:border-slate-700/50"
    >
      MVP Phase
    </Badge>
  </div>

</div>

      {/* Sync Controls Tied directly to Zustand */}
      <div className="flex items-center gap-4">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="outline"
            onClick={() => fetchInfrastructure()}
            disabled={isLoading}
            className="font-bold text-slate-600 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
            size="lg"
          >
            <ArrowsClockwiseIcon weight="bold" className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            {isLoading ? 'Scanning AWS Engine...' : 'Sync Infrastructure'}
          </Button>
        </motion.div>


        <Separator orientation="vertical" className="h-6 bg-slate-200 dark:bg-slate-700" />

        <div className="relative">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 relative ${isNotificationsOpen ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
            >
              <motion.div
                whileHover={{ rotate: [0, -15, 15, -15, 0] }}
                transition={{ duration: 0.4 }}
              >
                <BellIcon weight={isNotificationsOpen ? "fill" : "duotone"} className="w-5 h-5" />
              </motion.div>
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse border-2 border-white dark:border-slate-900" />
            </Button>
          </motion.div>

          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.15)] overflow-hidden z-[100]"
              >
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notifications</span>
                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline">Mark all as read</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {/* Mock alerts */}
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <div className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">High Latency: Ingress API</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Average response time exceeded 60ms threshold across 3 AZs.</p>
                        <p className="text-[9px] font-black text-slate-400 mt-2 uppercase tracking-widest">2 mins ago</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <div className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-amber-500 shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Cost Spike Detected</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">MongoDB Atlas projected cost increased by 15% due to high IOPS.</p>
                        <p className="text-[9px] font-black text-slate-400 mt-2 uppercase tracking-widest">1 hour ago</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                    <div className="flex gap-3">
                      <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Deployment Successful</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">VPC configuration updated automatically.</p>
                        <p className="text-[9px] font-black text-slate-400 mt-2 uppercase tracking-widest">3 hours ago</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={replayTour}
            className="text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
            title="Replay Product Tour"
          >
            <ArrowCounterClockwiseIcon weight="bold" className="w-4 h-4 text-white" />
          </Button>
        </motion.div>


        <ThemeToggle />
        <button className="bg-gradient-to-tr from-indigo-500 to-violet-500 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black shadow-sm hover:shadow-md transition-shadow">
          B
        </button>
      </div>




    </header>
  );
}