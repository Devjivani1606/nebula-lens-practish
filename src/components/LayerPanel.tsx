import React from 'react';
import { motion } from 'framer-motion';
import { useLayerStore } from '../store/layerStore';
import { ShareNetwork, ShieldCheck, CurrencyDollar, Icon } from '@phosphor-icons/react';

const iconMap: Record<string, Icon> = {
  'network': ShareNetwork,
  'shield': ShieldCheck,
  'dollar-sign': CurrencyDollar,
};

export default function LayerPanel() {
  const layers = useLayerStore((state) => state.layers);
  const activeLayers = useLayerStore((state) => state.activeLayers);
  const toggleLayer = useLayerStore((state) => state.toggleLayer);

  return (
    <div className="flex flex-col gap-1.5 bg-white/80 dark:bg-[#111111]/80 backdrop-blur-xl p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-[#222222] pointer-events-auto min-w-[140px]">
      {layers.map((layer) => {
        const isActive = activeLayers.includes(layer.id);
        const IconComponent = iconMap[layer.icon] || ShareNetwork;
        
        // Fallback colors if layer doesn't specify a tint
        const fallbackTint = layer.id.includes('security') 
          ? '#f59e0b' // Amber
          : layer.id.includes('cost') 
            ? '#10b981' // Emerald
            : '#8b5cf6'; // Purple
            
        const tint = (layer.renderOverride as any)?.tint || fallbackTint;

        return (
          <motion.button
            key={layer.id}
            onClick={() => toggleLayer(layer.id)}
            whileTap={{ scale: 0.97 }}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
              ${isActive 
                ? 'shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#222222]'
              }
            `}
            style={isActive ? {
              backgroundColor: `${tint}20`, // 20% opacity using hex
              color: tint,
              border: `1px solid ${tint}40`
            } : {
              border: '1px solid transparent',
              backgroundColor: 'transparent'
            }}
          >
            <IconComponent weight={isActive ? "fill" : "regular"} size={20} className="shrink-0" />
            <span className="truncate">{layer.name}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
