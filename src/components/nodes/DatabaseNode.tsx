'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';

const springTransition = { type: "spring", stiffness: 400, damping: 30 };

function DatabaseNode({ data }: { data: any }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={springTransition}
      className="relative min-w-[220px] rounded-xl backdrop-blur-md bg-white/60 border border-slate-200/50 p-4 shadow-sm"
    >


      {/* INVISIBLE OMNI-HANDLE:
  Placed in the exact center (top-1/2 left-1/2), but opacity-0 makes it invisible.
  Our Smart Edge will calculate the real boundaries dynamically!
*/}
<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
  <Handle type="target" position={Position.Top} className="opacity-0" />
  <Handle type="source" position={Position.Bottom} className="opacity-0" />
</div>

      {/* Node Header */}
      <div className="flex items-center gap-3">
        {/* DB Icon Box */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white font-bold shadow-inner">
          DB
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{data.engine}</span>
          <span className="text-sm font-bold text-slate-800">{data.name}</span>
        </div>
      </div>

      {/* DB Specific Metadata */}
      {data.status && (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-indigo-700 bg-indigo-50/50 p-2 rounded-md border border-indigo-100">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          {data.status}
        </div>
      )}

      

    </motion.div>
  );
}

export default memo(DatabaseNode);