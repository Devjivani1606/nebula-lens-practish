'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCanvasStore } from '../../store/useCanvasStore';
import { MagnifyingGlassIcon, HardDrivesIcon, ShieldCheckIcon, CurrencyDollarIcon, PlanetIcon, PulseIcon, XIcon, LayoutIcon, GearIcon } from '@phosphor-icons/react';
import { useReactFlow } from '@xyflow/react';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 0.5, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};

const paletteVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.18, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.13, ease: "easeIn" } }
};

const listVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.04 }
  }
};

const itemVariants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" } }
};

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodes = useCanvasStore(state => state.nodes);
  const setActiveLens = useCanvasStore(state => state.setActiveLens);
  const setSelectedNodeId = useCanvasStore(state => state.setSelectedNodeId);
  const toggleLiveStream = useCanvasStore(state => state.toggleLiveStream);
  const isLiveStreamActive = useCanvasStore(state => state.isLiveStreamActive);

  const { setCenter } = useReactFlow();

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

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSearch('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const closePalette = () => setIsOpen(false);

  const executeAction = (action: () => void) => {
    action();
    closePalette();
  };

  const focusNode = (node: any) => {
    setSelectedNodeId(node.id);
    setCenter(node.position.x + 100, node.position.y + 50, { zoom: 1.2, duration: 400 });
    closePalette();
  };

  const allItems = useMemo(() => {
    const actions = [
      { id: 'blast', category: 'Actions', label: 'Simulate Blast Radius', icon: PlanetIcon, action: () => executeAction(() => setActiveLens('blast-radius')) },
      { id: 'stream', category: 'Actions', label: isLiveStreamActive ? 'Stop Live Telemetry Stream' : 'Start Live Telemetry Stream', icon: PulseIcon, action: () => executeAction(toggleLiveStream) }
    ];

    const views = [
      { id: 'cost', category: 'Views', label: 'Analyze Cost Topology', icon: CurrencyDollarIcon, action: () => executeAction(() => setActiveLens('cost')) },
      { id: 'security', category: 'Views', label: 'Audit Security Posture', icon: ShieldCheckIcon, action: () => executeAction(() => setActiveLens('security')) }
    ];
    
    // Additional placeholders to show "Settings" group as requested
    const settings = [
      { id: 'prefs', category: 'Settings', label: 'Preferences', icon: GearIcon, action: closePalette },
      { id: 'layout', category: 'Settings', label: 'Layout Options', icon: LayoutIcon, action: closePalette }
    ];

    const sysItems = [...actions, ...views, ...settings].filter(i => 
      !search || 
      i.label.toLowerCase().includes(search.toLowerCase()) || 
      i.category.toLowerCase().includes(search.toLowerCase())
    );

    const nodeItems = nodes.filter(n => n.type !== 'VPC' && ((n.data?.name as string || n.id).toLowerCase().includes(search.toLowerCase()))).map(node => ({
      id: node.id,
      category: 'Nodes',
      label: (node.data?.name as string) || node.id,
      subLabel: node.type?.replace('Node', '').toUpperCase(),
      icon: HardDrivesIcon,
      action: () => focusNode(node)
    }));

    return [...sysItems, ...nodeItems];
  }, [search, nodes, isLiveStreamActive]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % Math.max(allItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + allItems.length) % Math.max(allItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[activeIndex]) {
        allItems[activeIndex].action();
      }
    }
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, typeof allItems> = {};
    allItems.forEach(item => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    });
    return groups;
  }, [allItems]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] pointer-events-none">
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={closePalette}
            className="fixed inset-0 bg-slate-900 dark:bg-black pointer-events-auto"
          />

          {/* The Palette */}
          <motion.div
            variants={paletteVariants as any}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative z-[101] w-full max-w-2xl overflow-hidden rounded-2xl shadow-[0_12px_24px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_24px_rgba(0,0,0,0.5)] bg-white/70 dark:bg-[#0A0A0A]/70 backdrop-blur-3xl saturate-[1.2] border border-white/60 dark:border-white/[0.08] pointer-events-auto"
          >
            {/* Search Input */}
            <div className="flex items-center px-4 border-b border-slate-200/50 dark:border-white/[0.05]">
              <MagnifyingGlassIcon className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search infrastructure, run commands..."
                className="w-full bg-transparent border-0 py-4 pl-3 pr-4 text-[15px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-0"
              />
              <div className="flex items-center gap-1 shrink-0">
                <kbd className="px-2 py-1 text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-white/5 rounded-md">ESC</kbd>
              </div>
            </div>

            {/* Results List */}
            <div className="max-h-[60vh] overflow-y-auto p-2">
              <AnimatePresence mode="wait">
                {allItems.length === 0 ? (
                  <motion.div
                    key="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.2 } }}
                    exit={{ opacity: 0 }}
                    className="py-12 flex items-center justify-center"
                  >
                    <p className="text-[13px] text-slate-400 dark:text-slate-500">No results</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={search} // Re-stagger on every new search query
                    variants={listVariants}
                    initial="initial"
                    animate="animate"
                  >
                    {Object.entries(groupedItems).map(([category, items]) => (
                      <div key={category} className="mb-2 last:mb-0">
                        <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.6px] text-[var(--gl-text-muted)]">
                          {category}
                        </div>
                        {items.map(item => {
                          const flatIndex = allItems.findIndex(i => i.id === item.id);
                          const isActive = flatIndex === activeIndex;
                          
                          return (
                            <motion.div key={item.id} variants={itemVariants as any} className="relative">
                              {isActive && (
                                <motion.div
                                  layoutId="cmd-active-bg"
                                  className="absolute inset-0 bg-slate-100 dark:bg-white/[0.06] rounded-xl border-l-2 border-[#7C6FF7]"
                                  transition={{ duration: 0.1 }}
                                />
                              )}
                              <button
                                onClick={item.action}
                                onMouseEnter={() => setActiveIndex(flatIndex)}
                                className="relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <item.icon className="w-4 h-4 text-slate-500 shrink-0" />
                                  <span className="text-[14px] font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                                </div>
                                {(item as any).subLabel && (
                                  <span className="text-[10px] font-medium text-slate-400">{(item as any).subLabel}</span>
                                )}
                              </button>
                            </motion.div>
                          );
                        })}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}