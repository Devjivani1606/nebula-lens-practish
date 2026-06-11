"use client";

import React from "react";
import ArchitectureCanvas from "@/components/canvas/ArchitectureCanvas";
import ProductTour from "@/components/ui/ProductTour";

export default function CanvasPage() {
  return (
    <div className="w-full h-full relative bg-[var(--gl-bg-base)]">
      <ArchitectureCanvas />
      <ProductTour />
    </div>
  );
}
