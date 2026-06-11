'use client';

import { Button } from './button';
import { useCanvasStore } from '../../store/useCanvasStore';
import { motion } from 'framer-motion';
import { GraphIcon, PlanetIcon, CurrencyDollarIcon, DownloadSimpleIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { Panel } from '@xyflow/react';
import { toPng } from 'html-to-image'; // Added html-to-image engine

const lenses = [
  { id: 'structural', label: 'Structural', icon: GraphIcon },
  { id: 'blast-radius', label: 'Blast Radius', icon: PlanetIcon },
  { id: 'cost', label: 'Cost Topology', icon: CurrencyDollarIcon },
  { id: 'security', label: 'Security Posture', icon: ShieldCheckIcon },
] as const;

export default function LensToolbar() {
  const activeLens = useCanvasStore((state) => state.activeLens);
  const setActiveLens = useCanvasStore((state) => state.setActiveLens);
  const setSelectedNodeId = useCanvasStore((state) => state.setSelectedNodeId);

  const handleLensChange = (lensId: any) => {
    setActiveLens(lensId);
    setSelectedNodeId(null);
  };

  // GPU-Accelerated Image Snapshot Downloader
  const downloadImage = () => {
    const viewportElement = document.querySelector('.react-flow__viewport') as HTMLElement;

    if (viewportElement) {
      toPng(viewportElement, {
        backgroundColor: '#f8fafc', // Matches base grid slate background
        quality: 1,                 // Production crisp clarity level
        pixelRatio: 2               // High-density Retina display ratio scaling
      }).then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `gravity-lens-${activeLens}-snapshot.png`;
        link.href = dataUrl;
        link.click();
      });
    }
  };

  return (
    <Panel position="top-center" className="pointer-events-auto z-50 mt-4">
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
      >
        {/* The Premium Glassmorphism Shell */}
        <div data-tour-id="lens-toolbar" className="flex items-center gap-1 p-1.5 bg-white/60 dark:bg-[#111111]/80 backdrop-blur-2xl border border-white/60 dark:border-slate-800/50 shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-full">

          {/* Lens Mapping Loop */}
          {lenses.map(({ id, label, icon: Icon }) => {
            const isActive = activeLens === id;

            return (
              <motion.div key={id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  variant="ghost"
                  onClick={() => handleLensChange(id)}
                  className={`
                    relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 h-auto select-none
                    ${isActive ? 'text-indigo-700 dark:text-indigo-400 hover:bg-transparent hover:text-indigo-700 dark:hover:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-[#222222]/50'}
                  `}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-lens-pill"
                      className="absolute inset-0 bg-white dark:bg-[#222222] rounded-full shadow-sm border border-indigo-100/40 dark:border-indigo-900/40"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon weight={isActive ? "fill" : "duotone"} className={`w-4 h-4 relative z-10 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="relative z-10">{label}</span>
                </Button>
              </motion.div>
            );
          })}

          {/* Elegant Subtle Separator Line */}
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-800 mx-1.5 shrink-0 self-center" />

          {/* Export Feature Action Button */}
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              data-tour-id="export-button"
              variant="ghost"
              onClick={downloadImage}
              className="relative flex items-center justify-center p-2 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-[#222222]/50 shrink-0 h-9 w-9 transition-all duration-200"
              title="Download Architecture Snapshot"
            >
              <DownloadSimpleIcon weight="bold" className="w-4.5 h-4.5" />
            </Button>
          </motion.div>

        </div>
      </motion.div>
    </Panel>
  );
}