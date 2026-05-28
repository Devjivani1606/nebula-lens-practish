'use client';

import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';

const springTransition = { type: "spring", stiffness: 400, damping: 30 };

function S3Node({ data }: { data: any }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={springTransition}
      className="relative min-w-[220px] rounded-xl backdrop-blur-md bg-white/60 border border-slate-200/50 p-4 shadow-sm"
    >


      {/* Node Header */}
      <div className="flex items-center gap-3">
        {/* S3 Icon Box */}
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold shadow-inner">
          S3
        </div>

        <div className="flex flex-col">
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Bucket</span>
          <span className="text-sm font-bold text-slate-800 truncate w-32" title={data.name}>
            {data.name}
          </span>
        </div>
      </div>

      {/* S3 Specific Metadata */}
      <div className="mt-3 space-y-1 text-xs text-slate-600">
        <div className="flex justify-between items-center bg-slate-100/50 px-2 py-1 rounded">
          <span className="font-medium">Created:</span>
          <span>{data.creationDate}</span>
        </div>
        <div className="flex justify-between items-center bg-slate-100/50 px-2 py-1 rounded">
          <span className="font-medium">Access:</span>
          <span className="text-amber-600 font-semibold">{data.publicAccess}</span>
        </div>
      </div>



    </motion.div>
  );
}

export default memo(S3Node);