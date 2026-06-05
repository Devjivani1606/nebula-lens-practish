'use client';

import { Button } from './button';
import { useCanvasStore } from '../../store/useCanvasStore';
import { motion } from 'framer-motion';
import { Network, Orbit, CircleDollarSign, Download } from 'lucide-react'; // Added Download Icon
import { Panel } from '@xyflow/react';
import { toPng } from 'html-to-image'; // Added html-to-image engine

const lenses = [
  { id: 'structural', label: 'Structural', icon: Network },
  { id: 'blast-radius', label: 'Blast Radius', icon: Orbit },
  { id: 'cost', label: 'Cost Topology', icon: CircleDollarSign },
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
        <div className="flex items-center gap-1 p-1.5 bg-white/60 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.04)] rounded-full">

          {/* Lens Mapping Loop */}
          {lenses.map(({ id, label, icon: Icon }) => {
            const isActive = activeLens === id;

            return (
              <Button
                key={id}
                variant="ghost"
                onClick={() => handleLensChange(id)}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 h-auto select-none
                  ${isActive ? 'text-indigo-700 hover:bg-transparent hover:text-indigo-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'}
                `}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-lens-pill"
                    className="absolute inset-0 bg-white rounded-full shadow-sm border border-indigo-100/40"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={`w-4 h-4 relative z-10 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className="relative z-10">{label}</span>
              </Button>
            );
          })}

          {/* Elegant Subtle Separator Line */}
          <div className="w-px h-5 bg-slate-200 mx-1.5 shrink-0 self-center" />

          {/* Export Feature Action Button */}
          <Button
            variant="ghost"
            onClick={downloadImage}
            className="relative flex items-center justify-center p-2 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100/50 shrink-0 h-9 w-9 transition-all duration-200"
            title="Download Architecture Snapshot"
          >
            <Download className="w-4.5 h-4.5" />
          </Button>

        </div>
      </motion.div>
    </Panel>
  );
}