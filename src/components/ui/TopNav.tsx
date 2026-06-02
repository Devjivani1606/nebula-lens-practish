'use client';

import React, { useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Cloud, RefreshCw, Bell } from 'lucide-react';

export default function TopNav() {
  const isLoading = useCanvasStore((state) => state.isLoading);
  const fetchInfrastructure = useCanvasStore((state) => state.fetchInfrastructure);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 z-50">

      {/* Left: Branding & Logo */}
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm shadow-indigo-200">
          <Cloud className="w-5 h-5 text-white" />
        </div>
        <span className="font-black text-lg text-slate-800 tracking-tight">
          Nebula Lens
        </span>
        <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] uppercase font-black rounded-md border border-slate-200 tracking-widest">
          MVP Phase
        </span>
      </div>

      {/* Sync Controls Tied directly to Zustand */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => fetchInfrastructure()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-70"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          {isLoading ? 'Scanning AWS Engine...' : 'Sync Infrastructure'}
        </button>

        <div className="w-px h-6 bg-slate-200" />

        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          <Bell className="w-5 h-5" />
        </button>

        {/* User Avatar */}
        <button className="bg-gradient-to-tr from-indigo-500 to-violet-500 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black shadow-sm hover:shadow-md transition-shadow">
          B
        </button>
      </div>




    </header>
  );
}