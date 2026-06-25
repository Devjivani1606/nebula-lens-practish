'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLayerStore } from '../../store/layerStore';
import { selectLayerStack, selectActiveLayerCount } from '../../store/selectors/layerSelectors';
import { Button } from '@/components/ui/button';
import { 
  Stack, 
  MagnifyingGlass, 
  ArrowsClockwise, 
  CaretDown, 
  CaretRight, 
  EyeSlash, 
  ShieldCheck, 
  HardDrives, 
  Graph, 
  Database, 
  Lightning, 
  Globe, 
  GitMerge, 
  Warning, 
  EnvelopeSimple 
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { LayerStackItem } from '../../types/layers';

const ICON_MAP: Record<string, React.ElementType> = {
  'network': Graph,
  'server': HardDrives,
  'database': Database,
  'database-zap': Database,
  'zap': Lightning,
  'shield': ShieldCheck,
  'globe': Globe,
  'git-merge': GitMerge,
  'alert-triangle': Warning,
  'mail': EnvelopeSimple
};

export default function LayerPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const layerStates = useLayerStore(state => state.layerStates);
  const layers = useLayerStore(state => state.layers);
  const toggleLayer = useLayerStore(state => state.toggleLayer);
  const resetLayers = useLayerStore(state => state.resetLayers);
  
  const layerStack = selectLayerStack({ layers, layerStates });
  const activeCount = selectActiveLayerCount({ layerStates });

  const filteredLayers = layerStack.filter(item => 
    item.definition.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.definition.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const systemLayers = filteredLayers.filter(l => l.definition.isSystem);
  const customLayers = filteredLayers.filter(l => !l.definition.isSystem);

  return (
    <div className="relative z-50">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/80 dark:bg-[#111111] backdrop-blur-md border border-slate-200 dark:border-[#333333] shadow-sm rounded-xl px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#222222]"
      >
        <Stack className="w-4 h-4" />
        Layers
        {activeCount > 0 && (
          <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
            {activeCount}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 left-0 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Stack className="w-4 h-4 text-indigo-500" weight="fill" />
                Layer Engine
              </h3>
              <Button variant="ghost" size="icon" onClick={resetLayers} className="h-8 w-8 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800" title="Reset to Defaults">
                <ArrowsClockwise className="w-3.5 h-3.5 text-slate-500" />
              </Button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <MagnifyingGlass className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filter layers..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/50 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none transition-all"
                />
              </div>
            </div>

            {/* Layer List */}
            <div className="overflow-y-auto p-2 flex-1 space-y-4">
              <LayerGroup title="System Layers" items={systemLayers} onToggle={toggleLayer} />
              {customLayers.length > 0 && (
                <LayerGroup title="Custom Layers" items={customLayers} onToggle={toggleLayer} />
              )}
              
              {filteredLayers.length === 0 && (
                <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm flex flex-col items-center">
                  <EyeSlash className="w-8 h-8 mb-2 opacity-20" />
                  No layers found matching "{searchQuery}"
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-500 text-center">
              Blend Modes: Additive (+), Subtractive (-), Exclusive (*), Override (!)
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LayerGroup({ title, items, onToggle }: { title: string, items: LayerStackItem[], onToggle: (id: string) => void }) {
  const [expanded, setExpanded] = useState(true);

  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      <button 
        onClick={() => setExpanded(!expanded)} 
        className="w-full flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        {expanded ? <CaretDown className="w-3.5 h-3.5" /> : <CaretRight className="w-3.5 h-3.5" />}
        {title} ({items.length})
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-1 px-1"
          >
            {items.map(item => (
              <LayerItem key={item.definition.id} item={item} onToggle={onToggle} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LayerItem({ item, onToggle }: { item: LayerStackItem, onToggle: (id: string) => void }) {
  const { definition, state } = item;
  const Icon = ICON_MAP[definition.icon] || Stack;
  
  const blendModeSymbol = {
    'additive': '+',
    'subtractive': '-',
    'exclusive': '*',
    'override': '!'
  }[definition.blendMode];

  return (
    <div 
      className={cn(
        "group flex items-center justify-between p-2 rounded-xl transition-all duration-200",
        state.enabled 
          ? "bg-slate-100 dark:bg-slate-800/50 border-transparent shadow-sm" 
          : "bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30 border-transparent"
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0 pr-3" title={definition.description}>
        <div 
          className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm transition-all duration-300 shrink-0"
          style={{ 
            backgroundColor: state.enabled ? `${definition.color}20` : 'transparent',
            color: state.enabled ? definition.color : '#94a3b8',
            border: `1px solid ${state.enabled ? `${definition.color}40` : 'transparent'}`
          }}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex flex-col truncate">
          <span className={cn(
            "text-sm font-medium transition-colors duration-200 truncate",
            state.enabled ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"
          )}>
            {definition.label}
          </span>
          <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
            <span className="font-mono bg-slate-200/50 dark:bg-slate-700/50 px-1 rounded-sm" title={`Blend Mode: ${definition.blendMode}`}>
              {blendModeSymbol}
            </span>
            {definition.tags[0]}
          </span>
        </div>
      </div>
      
      {/* Custom Switch built with input checkbox */}
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input 
          type="checkbox" 
          className="sr-only peer"
          checked={state.enabled}
          onChange={() => onToggle(definition.id)}
        />
        <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
      </label>
    </div>
  );
}
