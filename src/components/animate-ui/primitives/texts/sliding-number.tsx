'use client';

import React, { useEffect } from 'react';
import { motion, useSpring } from 'framer-motion';

export function SlidingNumber({
  number,
  className = '',
  padStart = false,
}: {
  number: number;
  className?: string;
  padStart?: boolean;
}) {
  const numStr = padStart ? String(number).padStart(2, '0') : String(number);
  
  return (
    <span className={`inline-flex overflow-hidden h-[24px] items-center ${className}`}>
      {numStr.split('').map((char, idx) => {
        if (isNaN(Number(char))) {
          return <span key={idx} className="px-0.5">{char}</span>;
        }
        return <Digit key={idx} digit={Number(char)} />;
      })}
    </span>
  );
}

function Digit({ digit }: { digit: number }) {
  const spring = useSpring(digit * -24, { stiffness: 220, damping: 26 });

  useEffect(() => {
    spring.set(digit * -24);
  }, [digit, spring]);

  return (
    <span className="relative w-[0.6em] h-[24px] overflow-hidden inline-block">
      <motion.div
        style={{ y: spring }}
        className="absolute flex flex-col left-0 right-0"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="h-[24px] flex items-center justify-center font-mono text-sm font-bold">
            {n}
          </span>
        ))}
      </motion.div>
    </span>
  );
}
