'use client';
// src/components/landing/ScenarioElevation.tsx
//
// The worked example as an annotated architectural elevation. A project rises
// off a ground line one contribution at a time - foundation, floors, systems,
// crown - and each member's chip wires into the part they supplied.
//
// Geometry rules that keep it legible:
//   · every chip sits at its target's height, so leader lines stay horizontal
//     and never cross the facade or each other
//   · left and right columns alternate, so no two leaders share a lane
//   · all coordinates are literals (no trig), so SSR and client agree exactly
//
// Desktop only; narrow screens get the linear stack instead.

import { motion } from 'motion/react';
import { SCENARIO } from '@/lib/landing-data';
import { EASE } from './motion';

const W = 960;
const H = 640;

const GROUND = 520;
const BX1 = 380; // building left
const BX2 = 580; // building right
const BW = BX2 - BX1;

// Floor bands, bottom-up
const F_GROUND = 436; // materials  436→496
const F_TWO = 376; // structure  376→436
const F_THREE = 316; // structure  316→376
const CROWN_Y = 282; // brand      282→316
const FOUND_Y = 496; // capital    496→520

const CHIP_W = 224;
const CHIP_H = 46;
const L_X = 44;
const R_X = W - 44 - CHIP_W;

/** side, chip centre-y, and the point on the building it wires into. */
const ANNOT: Record<string, { side: 'l' | 'r'; cy: number; tx: number; ty: number }> = {
  marketing: { side: 'l', cy: 292, tx: BX1 - 14, ty: 299 },
  builder: { side: 'l', cy: 400, tx: BX1, ty: 406 },
  investor: { side: 'l', cy: 506, tx: BX1 - 30, ty: 508 },
  tech: { side: 'r', cy: 330, tx: BX2, ty: 346 },
  consultant: { side: 'r', cy: 406, tx: 606, ty: 406 },
  supplier: { side: 'r', cy: 478, tx: BX2, ty: 466 },
};

export default function ScenarioElevation({ done, calm }: { done: number; calm: boolean }) {
  const order = SCENARIO.layers.map((l) => l.key);
  const isOn = (key: string) => order.indexOf(key) < done;
  const complete = done >= SCENARIO.layers.length;

  /** Every part grows out of the thing beneath it. */
  const rise = (on: boolean, originY: number) => ({
    initial: false as const,
    animate: on ? { opacity: 1, scaleY: 1 } : { opacity: 0, scaleY: 0.12 },
    transition: { duration: calm ? 0 : 0.55, ease: EASE.arrive },
    style: { originY: `${originY}px`, originX: `${(BX1 + BX2) / 2}px` },
  });

  return (
    <svg
      className="lp-elev"
      /* Cropped to the drawing's real extent (badge top → base label) so it
         fills the frame instead of floating in empty canvas. */
      viewBox={`0 ${170} ${W} ${420}`}
      role="img"
      aria-label={`An elevation of ${SCENARIO.opportunity} being assembled from six member contributions: ${SCENARIO.layers
        .map((l) => `${l.role} - ${l.brings}`)
        .join('; ')}.`}
    >
      <defs>
        <pattern id="lp-brick" width="25" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 12h25M12.5 0v12" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
        </pattern>
        <linearGradient id="lp-slab" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.085)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.025)" />
        </linearGradient>
        <linearGradient id="lp-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e3d5a3" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#c8a84b" stopOpacity="0.08" />
        </linearGradient>
        <filter id="lp-lit" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* ── Completion badge, clear above the building ── */}
      <motion.g
        initial={false}
        animate={{ opacity: complete ? 1 : 0, y: complete ? 0 : 10 }}
        transition={{ duration: calm ? 0 : 0.5, ease: EASE.out }}
      >
        <rect x={348} y={186} width={264} height={34} rx={17} className="lp-elev-done" />
        <text x={480} y={208} className="lp-elev-done-t" textAnchor="middle">
          ✓ {SCENARIO.outcome.toUpperCase()}
        </text>
      </motion.g>

      {/* ── Ground ─────────────────────────────── */}
      <g aria-hidden>
        <line x1={250} y1={GROUND} x2={710} y2={GROUND} className="lp-elev-ground" />
        {Array.from({ length: 16 }).map((_, i) => (
          <line
            key={i}
            x1={258 + i * 29}
            y1={GROUND}
            x2={247 + i * 29}
            y2={GROUND + 12}
            className="lp-elev-hatch"
          />
        ))}
      </g>

      {/* ── 1 · Capital → foundation ───────────── */}
      <motion.g {...rise(isOn('investor'), GROUND)} aria-hidden>
        <rect x={BX1 - 30} y={FOUND_Y} width={BW + 60} height={24} rx={2} className="lp-elev-found" />
      </motion.g>

      {/* ── 2 · Expertise → the planned envelope ──
          The consultant sets out what the finished building will be, so the
          dimension line has an outline to measure. Later layers fill it in. */}
      <motion.g
        initial={false}
        animate={{ opacity: isOn('consultant') ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.5, ease: EASE.out }}
        aria-hidden
      >
        <rect
          x={BX1}
          y={CROWN_Y}
          width={BW}
          height={FOUND_Y - CROWN_Y}
          className="lp-elev-envelope"
        />
        <line x1={606} y1={CROWN_Y} x2={606} y2={FOUND_Y} className="lp-elev-dim" />
        <line x1={600} y1={CROWN_Y} x2={612} y2={CROWN_Y} className="lp-elev-dim" />
        <line x1={600} y1={FOUND_Y} x2={612} y2={FOUND_Y} className="lp-elev-dim" />
      </motion.g>

      {/* ── 3 · Materials → ground floor ───────── */}
      <motion.g {...rise(isOn('supplier'), FOUND_Y)} aria-hidden>
        <rect x={BX1} y={F_GROUND} width={BW} height={60} className="lp-elev-slab" />
        <rect x={BX1} y={F_GROUND} width={BW} height={60} fill="url(#lp-brick)" />
        <line x1={BX1} y1={F_GROUND} x2={BX2} y2={F_GROUND} className="lp-elev-edge" />
      </motion.g>

      {/* ── 4 · Structure → upper floors ───────── */}
      <motion.g {...rise(isOn('builder'), F_GROUND)} aria-hidden>
        {[F_TWO, F_THREE].map((y) => (
          <g key={y}>
            <rect x={BX1} y={y} width={BW} height={60} className="lp-elev-slab" />
            <line x1={BX1} y1={y} x2={BX2} y2={y} className="lp-elev-edge" />
          </g>
        ))}
        {[BX1, BX1 + 67, BX1 + 134, BX2].map((x) => (
          <line key={x} x1={x} y1={F_THREE} x2={x} y2={F_GROUND} className="lp-elev-col" />
        ))}
      </motion.g>

      {/* ── 5 · Systems → the building switches on ── */}
      <motion.g
        initial={false}
        animate={{ opacity: isOn('tech') ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.6, ease: EASE.out }}
        aria-hidden
      >
        {[F_GROUND, F_TWO, F_THREE].map((fy) =>
          [0, 1, 2, 3].map((c) => (
            <rect
              key={`${fy}-${c}`}
              x={BX1 + 23 + c * 45}
              y={fy + 16}
              width={20}
              height={28}
              rx={1.5}
              className="lp-elev-win"
            />
          )),
        )}
      </motion.g>

      {/* ── 6 · Brand → crown ──────────────────── */}
      <motion.g {...rise(isOn('marketing'), F_THREE)} aria-hidden>
        <rect x={BX1 - 14} y={CROWN_Y} width={BW + 28} height={34} rx={4} className="lp-elev-crown" />
        <rect x={BX1 - 14} y={CROWN_Y} width={BW + 28} height={34} rx={4} fill="url(#lp-crown)" />
        <text x={480} y={CROWN_Y + 22} className="lp-elev-sign" textAnchor="middle">
          OPEN
        </text>
        {isOn('marketing') && !calm && (
          <motion.rect
            x={BX1 - 14}
            y={CROWN_Y}
            width={BW + 28}
            height={34}
            rx={4}
            className="lp-elev-crown-glow"
            filter="url(#lp-lit)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0.3] }}
            transition={{ duration: 1.4, ease: EASE.out }}
          />
        )}
      </motion.g>

      {/* ── Annotations ────────────────────────── */}
      {SCENARIO.layers.map((l, i) => {
        const a = ANNOT[l.key];
        const on = i < done;
        const left = a.side === 'l';
        const x = left ? L_X : R_X;
        const anchorX = left ? x + CHIP_W : x;
        const midX = left ? (anchorX + a.tx) / 2 : (a.tx + anchorX) / 2;

        return (
          <motion.g
            key={l.key}
            className={`lp-elev-annot ${on ? 'is-on' : ''}`}
            initial={false}
            animate={{ opacity: on ? 1 : 0, x: on ? 0 : left ? -22 : 22 }}
            transition={{ duration: calm ? 0 : 0.5, ease: EASE.out, delay: calm ? 0 : 0.15 }}
          >
            {/* dog-leg leader: out, across, in - never over the facade */}
            <path
              d={`M ${anchorX} ${a.cy} H ${midX} V ${a.ty} H ${a.tx}`}
              className="lp-elev-lead"
            />
            <circle cx={a.tx} cy={a.ty} r={3.5} className="lp-elev-dot" />

            <rect
              x={x}
              y={a.cy - CHIP_H / 2}
              width={CHIP_W}
              height={CHIP_H}
              rx={10}
              className="lp-elev-chip"
            />
            <text x={x + 18} y={a.cy - 5} className="lp-elev-chip-layer">
              {l.layer.toUpperCase()}
            </text>
            <text x={x + 18} y={a.cy + 13} className="lp-elev-chip-role">
              {l.role}
            </text>
            <text x={x + CHIP_W - 16} y={a.cy + 5} className="lp-elev-chip-icon" textAnchor="end">
              {l.icon}
            </text>
          </motion.g>
        );
      })}

      {/* ── Base label ─────────────────────────── */}
      <text x={480} y={GROUND + 44} className="lp-elev-base" textAnchor="middle">
        {SCENARIO.opportunity}
      </text>
      <text x={480} y={GROUND + 62} className="lp-elev-base-note" textAnchor="middle">
        ENTERS THE community
      </text>
    </svg>
  );
}
