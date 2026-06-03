'use client';

import React, { useState } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { Cloud, RefreshCw, Bell } from 'lucide-react';
import { Button } from "./button";
import { Badge } from "./badge";
import { Separator } from "./separator";
import Image from 'next/image';

export default function TopNav() {
  const isLoading = useCanvasStore((state) => state.isLoading);
  const fetchInfrastructure = useCanvasStore((state) => state.fetchInfrastructure);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 z-50">

      {/* Left: Branding & Logo */}
      <div className="flex items-center gap-3">

  {/* 1. THE LOGO FIX */}
  <div className="flex items-center justify-center shrink-0 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
    <Image
      src="/logo/singleLogo.svg"
      alt="Gravity Lens Logo"
      width={36}
      height={36}
      // mix-blend-multiply is a CSS trick that makes white backgrounds turn transparent!
      className="object-contain mix-blend-multiply"
      priority
    />
  </div>

  {/* 2. THE TYPOGRAPHY & NEW BADGE */}
  <div className="flex items-center gap-2.5">
    <span className="font-black text-xl text-slate-800 tracking-tight">
      Gravity Lens
    </span>

    <Badge
      variant="secondary"
      className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200/50"
    >
      MVP Phase
    </Badge>
  </div>

</div>

      {/* Sync Controls Tied directly to Zustand */}
      <div className="flex items-center gap-4">
        <Button
  variant="outline"
  onClick={() => fetchInfrastructure()}
  disabled={isLoading}
  className="font-bold text-slate-600"
  size = "lg"
>
  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
  {isLoading ? 'Scanning AWS Engine...' : 'Sync Infrastructure'}
</Button>


        <Separator orientation="vertical" className="h-6 bg-slate-200" />

        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600">
  <Bell className="w-5 h-5" />
</Button>


        {/* User Avatar */}
        <button className="bg-gradient-to-tr from-indigo-500 to-violet-500 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-black shadow-sm hover:shadow-md transition-shadow">
          B
        </button>
      </div>




    </header>
  );
}