'use client';
// src/components/landing/ScrollCue.tsx
//
// The cue at the foot of the hero. The chevron itself travels down the track
// and fades, then repeats - the arrow does the pointing rather than a bead
// standing in for it. A second chevron follows a beat behind so the motion
// reads as a cascade downward instead of a single blip.
//
// The travel is deliberately NOT gated on prefers-reduced-motion - the owner
// wants the cue visibly moving, as with the sector wheel. It runs slower
// under that setting, and the scroll it triggers still jumps rather than
// gliding, which is the part that actually causes discomfort.

import { motion } from 'motion/react';
import { EASE, useCalm } from './motion';

/** How far the chevron travels, in px. */
const TRAVEL = 26;

export default function ScrollCue({ to = '#what' }: { to?: string }) {
  const calm = useCalm();

  const go = () => {
    document.querySelector(to)?.scrollIntoView({
      behavior: calm ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const chevron = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );

  return (
    <div className="lp-cue-wrap">
      <motion.button
        type="button"
        className="lp-cue"
        onClick={go}
        aria-label="Scroll to the next section"
        initial={calm ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: calm ? 0 : 0.8, ease: EASE.out, delay: calm ? 0 : 1.5 }}
      >
        <span className="lp-cue-label">Scroll</span>

        <span className="lp-cue-lane" aria-hidden>
          {[0, 1].map((n) => (
            <motion.span
              key={n}
              className="lp-cue-chevron"
              animate={{ y: [0, TRAVEL], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: calm ? 2.6 : 1.8,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatDelay: 0.2,
                delay: n * (calm ? 0.45 : 0.32),
                times: [0, 0.25, 0.7, 1],
              }}
            >
              {chevron}
            </motion.span>
          ))}
        </span>
      </motion.button>
    </div>
  );
}
