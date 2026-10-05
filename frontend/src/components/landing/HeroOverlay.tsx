'use client';
// src/components/landing/HeroOverlay.tsx
//
// Motion over the hero photograph. The room is real and still; what moves on
// top of it is what the room is for - two members being matched, one pairing
// at a time. Two anchor dots pulse, a connector draws between them, and a
// card names the match before it fades and the next one forms.
//
// Positions are percentages of the overlay box, not of the photo, so nothing
// depends on where faces happen to land after `object-fit: cover` crops.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { EASE, useCalm } from './motion';

/** Illustrative pairings, drawn from the twelve sectors in the community. */
const MATCHES = [
  { a: 'Real Estate', b: 'Finance', note: 'a site meets its funding' },
  { a: 'Energy', b: 'Technology', note: 'a project meets its systems' },
  { a: 'Fashion', b: 'Production', note: 'a collection meets its campaign' },
  { a: 'Healthcare', b: 'Academy', note: 'a programme meets its people' },
  { a: 'Construction', b: 'Consulting', note: 'a build meets its expertise' },
];

const CYCLE_MS = 3600;

export default function HeroOverlay() {
  const calm = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [i, setI] = useState(0);

  useEffect(() => {
    if (calm || !inView) return;
    const id = setInterval(() => setI((n) => (n + 1) % MATCHES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [calm, inView]);

  // Under reduced motion the overlay would be a static, meaningless
  // decoration over a photograph - better to leave the photo alone.
  if (calm) return null;

  const m = MATCHES[i];

  return (
    <div className="lp-ho" ref={ref} aria-hidden>
      <svg className="lp-ho-svg" viewBox="0 0 320 260" fill="none">
        {/* connector, redrawn for each pairing */}
        <motion.path
          key={`line-${i}`}
          d="M 46 40 C 120 70, 200 160, 274 218"
          className="lp-ho-line"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: EASE.out }}
        />

        {[
          { cx: 46, cy: 40 },
          { cx: 274, cy: 218 },
        ].map((p, n) => (
          <g key={n}>
            <motion.circle
              cx={p.cx}
              cy={p.cy}
              r={5}
              className="lp-ho-dot"
              animate={{ scale: [1, 1.18, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: n * 0.4 }}
              style={{ originX: `${p.cx}px`, originY: `${p.cy}px` }}
            />
            <motion.circle
              cx={p.cx}
              cy={p.cy}
              r={5}
              className="lp-ho-ring"
              animate={{ scale: [1, 3.4], opacity: [0.55, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: n * 0.4 }}
              style={{ originX: `${p.cx}px`, originY: `${p.cy}px` }}
            />
          </g>
        ))}
      </svg>

      <AnimatePresence mode="wait">
        <motion.div
          className="lp-ho-card"
          key={`card-${i}`}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.55, ease: EASE.out }}
        >
          <span className="lp-ho-pair">
            <span>{m.a}</span>
            <span className="lp-ho-link" aria-hidden>
              ⇄
            </span>
            <span>{m.b}</span>
          </span>
          <span className="lp-ho-note">{m.note}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
