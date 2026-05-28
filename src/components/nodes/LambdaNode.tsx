import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';

// The mentor's exact spring physics configuration
const springTransition = { type: "spring", stiffness: 400, damping: 30 };

function LambdaNode({ data }: { data: any }) {
  return (
    // framer-motion wrapper for physical interactions
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={springTransition}
      // Glassmorphism styling: blur, translucent background, subtle border
      className="relative min-w-[200px] rounded-xl backdrop-blur-md bg-white/60 border border-slate-200/50 p-4 shadow-sm"
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