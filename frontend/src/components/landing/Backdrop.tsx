'use client';
// src/components/landing/Backdrop.tsx
// Ambient layers + a scroll progress line. Deliberately restrained: four slow
// blobs, a grid, a grain layer. All fixed, all composited - no per-scroll work.
// Under prefers-reduced-motion the blobs hold still and the rail disappears.

import { motion, useScroll, useSpring } from 'motion/react';
import { useCalm } from './motion';

export default function Backdrop() {
  const calm = useCalm();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });

  return (
    <>
      <div className={`lp-aurora ${calm ? 'lp-aurora-still' : ''}`} aria-hidden>
        <span className="lp-blob lp-blob-1" />
        <span className="lp-blob lp-blob-2" />
        <span className="lp-blob lp-blob-3" />
        <span className="lp-blob lp-blob-4" />
      </div>
      <div className="lp-grid" aria-hidden />
      <div className="lp-noise" aria-hidden />

      {!calm && (
        <motion.div className="lp-progress" style={{ scaleX: progress }} aria-hidden />
      )}
    </>
  );
}
