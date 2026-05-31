'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';

const springTransition = { type: "spring", stiffness: 400, damping: 30 } as const;

function SqsNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      //framer motion animation
      animate={{
        boxShadow: selected
          ? "0px 0px 0px 2px #3b82f6, 0px 10px 25px -5px rgba(59, 130, 246, 0.4)"
          : "0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px -1px rgba(0, 0, 0, 0.1)",
        borderColor: selected ? "rgba(59, 130, 246, 0)" : "rgba(226, 232, 240, 0.5)",
      }}
      transition={springTransition} // This uses the same stiffness:400 spring as everything else!
      // Keep only the base layout classes here
      className="relative min-w-[200px] rounded-xl backdrop-blur-md bg-white/60 p-4 border"
    >

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none">
        <Handle type="target" position={Position.Top} className="opacity-0" />
        <Handle type="source" position={Position.Bottom} className="opacity-0" />
      </div>

      {/* Node Header */}
      <div className="flex items-center gap-3">
        {/* SQS Icon Box */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white font-bold shadow-inner">
          SQS
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">SQS</span>
          <span className="text-sm font-bold text-slate-800 truncate w-32" title={data.name}>
            {data.name}
          </span>
        </div>
      </div>

    </motion.div>
  );
}

export default memo(SqsNode);