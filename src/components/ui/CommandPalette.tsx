'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../../store/useCanvasStore';
import { MagnifyingGlassIcon, HardDrivesIcon, ShieldCheckIcon, CurrencyDollarIcon, PlanetIcon, PulseIcon, XIcon } from '@phosphor-icons/react';
import { useReactFlow } from '@xyflow/react';

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Connect to our global store
  const nodes = useCanvasStore(state => state.nodes);
  const setActiveLens = useCanvasStore(state => state.setActiveLens);
  const setSelectedNodeId = useCanvasStore(state => state.setSelectedNodeId);
  const toggleLiveStream = useCanvasStore(state => state.toggleLiveStream);
  const isLiveStreamActive = useCanvasStore(state => state.isLiveStreamActive);

  // Use React Flow's hook to control the camera
  const { setCenter } = useReactFlow();

  // Handle Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(open => !open);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearch('');
    }
  }, [isOpen]);

  const closePalette = () => setIsOpen(false);

  // Execute an action and close
  const executeAction = (action: () => void) => {
    action();
    closePalette();
  };

  // Jump camera to specific node
  const focusNode = (node: any) => {
    setSelectedNodeId(node.id);
    setCenter(node.position.x + 100, node.position.y + 50, { zoom: 1.2, duration: 800 });
    closePalette();
  };

  // Generate dynamic search results
  const filteredNodes = nodes.filter(n =>
    (n.data?.name as string || n.id).toLowerCase().includes(search.toLowerCase()) && n.type !== 'VPC'
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePalette}
            className="fixed inset-0 z-[100] bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm"
          />

          {/* The Apple Glass Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[101] w-full max-w-2xl overflow-hidden rounded-2xl shadow-[0_20px_50px_rgb(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgb(0,0,0,0.5)] bg-white/70 dark:bg-[#0A0A0A]/70 backdrop-blur-3xl saturate-[1.2] border border-white/60 dark:border-white/[0.08]"
          >
            {/* Search Input */}
            <div className="flex items-center px-4 border-b border-slate-200/50 dark:border-white/[0.05]">
              <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search infrastructure or type a command..."
                className="w-full bg-transparent border-0 py-4 pl-3 pr-4 text-base font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-0"
              />
              <div className="flex items-center gap-1 shrink-0">
                <kbd className="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-white/5 rounded-md">ESC</kbd>
              </div>
            </div>

            {/* Results List */}
            <div className="max-h-[60vh] overflow-y-auto p-2">

              {/* Quick Actions (only show if search is empty or matches) */}
              {(!search || 'cost security blast stream'.includes(search.toLowerCase())) && (
                <div className="mb-4">
                  <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">System Commands</p>
                  <CommandRow icon={CurrencyDollarIcon} label="Analyze Cost Topology" onClick={() => executeAction(() => setActiveLens('cost'))} color="text-emerald-500" />
                  <CommandRow icon={ShieldCheckIcon} label="Audit Security Posture" onClick={() => executeAction(() => setActiveLens('security'))} color="text-amber-500" />
                  <CommandRow icon={PlanetIcon} label="Simulate Blast Radius" onClick={() => executeAction(() => setActiveLens('blast-radius'))} color="text-orange-500" />
                  <CommandRow
                    icon={PulseIcon}
                    label={isLiveStreamActive ? "Stop Live Telemetry Stream" : "Start Live Telemetry Stream"}
                    onClick={() => executeAction(toggleLiveStream)}
                    color={isLiveStreamActive ? "text-red-500" : "text-blue-500"}
                  />
                </div>
              )}

              {/* Infrastructure Nodes */}
              {filteredNodes.length > 0 && (
                <div>
                  <p className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Infrastructure Resources</p>
                  {filteredNodes.map(node => (
                    <CommandRow
                      key={node.id}
                      icon={HardDrivesIcon}
                      label={(node.data?.name as string) || node.id}
                      subLabel={node.type?.replace('Node', '').toUpperCase()}
                      onClick={() => focusNode(node)}
                      color="text-slate-500"
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Reusable row component for the list
function CommandRow({ icon: Icon, label, subLabel, onClick, color }: any) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors group text-left"
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      {subLabel && (
        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity">
          {subLabel}
        </span>
      )}
    </button>
  );
}