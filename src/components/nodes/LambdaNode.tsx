import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import { useLensVisuals } from '../../hooks/useLensVisuals';
// The mentor's exact spring physics configuration
const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

function LambdaNode({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  // Ask the hook how this specific node should look right now
  const { opacity, isHighlighted, isDimmed } = useLensVisuals(id);
  return (
    // framer-motion wrapper for physical interactions
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      //framer motion animation
      animate={{
        opacity: opacity,
        boxShadow: (selected || isHighlighted)
          ? "0px 0px 0px 2px #3b82f6, 0px 10px 25px -5px rgba(59, 130, 246, 0.4)"
          : "0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)",
        borderColor: (selected || isHighlighted) ? "rgba(59, 130, 246, 0)" : "rgba(226, 232, 240, 0.5)",
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
        {/* Fake Lambda Icon */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold shadow-inner">
          λ
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Lambda</span>
          <span className="text-sm font-bold text-slate-800">{data.name}</span>
        </div>
      </div>

      {/* Metadata / Insights */}
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