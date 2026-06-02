import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
import Icon from "../../../public/icons/amazon-lambda.svg"
// The mentor's exact spring physics configuration
const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

function LambdaNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  // Ask the hook how this specific node should look right now
  const { opacity, isHighlighted, isDimmed, heatmapColor, borderColor: lensBorderColor } = useLensVisuals(id);

  const activeBackgroundColor = heatmapColor
  //   ? heatmapColor
  //   : (selected || isHighlighted ? "rgba(249, 115, 22, 0.05)" : "rgba(255, 255, 255, 1)");

  const activeBorderColor = lensBorderColor
    ? lensBorderColor
    : (selected || isHighlighted ? "rgba(249, 115, 22, 0)" : "rgba(226, 232, 240, 0.5)");

  return (
    // framer-motion wrapper for physical interactions
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      //framer motion animation
      animate={{
        opacity: opacity,
        backgroundColor: activeBackgroundColor, // <- Apply it here!
        borderColor: activeBorderColor,
        boxShadow: (selected || isHighlighted)
          ? "0px 0px 0px 2px #3b82f6, 0px 10px 25px -5px rgba(59, 130, 246, 0.4)"
          : "0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)",
        //borderColor: (selected || isHighlighted) ? "rgba(59, 130, 246, 0)" : "rgba(226, 232, 240, 0.5)",
      }}
      transition={springTransition} // This uses the same stiffness:400 spring as everything else!
      // Keep only the base layout classes here


      // 4. Disable pointer events if dimmed so the user can't accidentally click it
      className={`relative min-w-[200px] rounded-xl backdrop-blur-md bg-white/60 p-4 border ${
        isDimmed ? 'pointer-events-none grayscale-[50%]' : ''
      }`}
    >

      {/* INVISIBLE OMNI-HANDLE:
  Placed in the exact center (top-1/2 left-1/2), but opacity-0 makes it invisible.
  Our Smart Edge will calculate the real boundaries dynamically!
*/}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>

      {/* Node Content */}
      <div className="flex items-center gap-3">
        {/* 2. THE NEW ICON CONTAINER (Neutral, Glassy, Premium) */}
        <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] flex items-center justify-center shrink-0">
          <Image
            src={Icon}
            alt="Database"
            width={28}
            height={28}
            className="object-contain drop-shadow-sm"
          />
        </div>

        {/* 3. TYPOGRAPHY (Aligned and crisp) */}
        <div className="flex flex-col overflow-hidden">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
            {data.type || 'Lambda'}
          </h3>
          <h2 className="text-sm font-black text-slate-800 truncate">
            {data.name}
          </h2>
        </div>
      </div>
{/* Optional: Add a subtle divider before the metrics */}
      <div className="h-px w-full bg-slate-100 my-1" />

      {data.insights && (
        <div className="mt-3 text-xs font-medium text-slate-600 bg-slate-100/50 p-2 rounded-md border border-slate-200/50">
          {data.insights}
        </div>
      )}



    </motion.div>
  );
}

// Mentor Rule: "memoize every custom node component with React.memo"
export default memo(LambdaNode);