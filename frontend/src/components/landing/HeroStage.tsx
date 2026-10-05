'use client';
// src/components/landing/HeroStage.tsx
//
// The hero visual. Twelve real industry sectors sit on a ring around the
// community core. An opportunity enters at one sector, routes through the
// core, draws in the sectors that can contribute, and becomes something new.
//
// It is an illustration of how the community works - not a feed of live events.
// Everything is transform/opacity only, and it holds a single static frame
// under prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  animate,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { INDUSTRIES } from '@/lib/landing-data';
import { openSector } from '@/lib/sector-bus';
import { EASE, useCalm, useMediaQuery } from './motion';

/* ── Geometry ─────────────────────────────────────── */

const BOX = 600;
const C = BOX / 2;
const R_NODE = 228;

/**
 * Round every trig-derived coordinate.
 *
 * Node and V8-in-Chrome can differ in the last bit of `Math.cos`/`Math.sin`
 * (…714801 vs …714804), and React compares SSR and client attributes as
 * strings - so an unrounded coordinate is a hydration mismatch, which Next
 * shows as a runtime error overlay in dev. Two decimals is far finer than
 * a device pixel at this scale.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

type Node = {
  key: string;
  name: string;
  short: string;
  icon: string;
  image: string;
  angle: number;
  x: number;
  y: number;
};

const NODES: Node[] = INDUSTRIES.map((ind, i) => {
  const angle = -90 + i * (360 / INDUSTRIES.length);
  const rad = (angle * Math.PI) / 180;
  return {
    key: ind.key,
    name: ind.name,
    short: ind.short,
    icon: ind.icon,
    image: ind.thumb,
    angle,
    x: r2(C + R_NODE * Math.cos(rad)),
    y: r2(C + R_NODE * Math.sin(rad)),
  };
});

const nodeOf = (key: string) => NODES.find((n) => n.key === key)!;

/**
 * Chips are a fixed 108px wide because the ring only leaves 114px between
 * neighbours - so a label has about 78px, or ~11 characters at this size.
 * Anything longer wraps onto a second line rather than spilling out of the
 * chip. Measured: "Technology" = 75px (the longest that fits on one line),
 * "Media & Movie" = 103px (does not).
 */
const LABEL_CHARS = 11;

function wrapLabel(label: string, budget: number = LABEL_CHARS, maxLines = 2): string[] {
  if (label.length <= budget) return [label];
  const words = label.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > budget && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  // Fold the overflow into the last permitted line.
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
}

/**
 * Dial ticks around the rim. Every 5°, with the twelve sector bearings
 * marked longer and in gold - it is what turns a plain circle into
 * something that reads as an instrument.
 */
/** The needle is fixed at 12 o'clock; the wheel turns beneath it. */
const NEEDLE_DEG = -90;
const R_CORE = 104;
const R_CORE_OPEN = 104;

const R_RIM = R_NODE + 30;
const TICKS = Array.from({ length: 72 }, (_, i) => {
  const deg = i * 5;
  const major = deg % 30 === 0;
  const rad = (deg * Math.PI) / 180;
  const inner = R_RIM - (major ? 13 : 6);
  return {
    deg,
    major,
    x1: r2(C + inner * Math.cos(rad)),
    y1: r2(C + inner * Math.sin(rad)),
    x2: r2(C + R_RIM * Math.cos(rad)),
    y2: r2(C + R_RIM * Math.sin(rad)),
  };
});

/* ── The story ────────────────────────────────────── */
/* Each scenario is an illustrative combination of the twelve
   sectors the community actually represents. */

type Scenario = {
  origin: string;
  opportunity: string;
  contributors: { key: string; brings: string }[];
  outcome: string;
};

const SCENARIOS: Scenario[] = [
  {
    origin: 'real-estate',
    opportunity: 'A development site comes up',
    contributors: [
      { key: 'finance', brings: 'funds it' },
      { key: 'building', brings: 'builds it' },
      { key: 'energy', brings: 'powers it' },
    ],
    outcome: 'A funded development',
  },
  {
    origin: 'energy',
    opportunity: 'A solar project needs backing',
    contributors: [
      { key: 'finance', brings: 'structures the capital' },
      { key: 'technology', brings: 'runs the systems' },
      { key: 'consulting', brings: 'clears the regulation' },
    ],
    outcome: 'A financed energy build',
  },
  {
    origin: 'fashion',
    opportunity: 'A new collection needs a market',
    contributors: [
      { key: 'film', brings: 'shoots the campaign' },
      { key: 'technology', brings: 'builds the storefront' },
      { key: 'finance', brings: 'funds the run' },
    ],
    outcome: 'A brand in a new market',
  },
  {
    origin: 'healthcare',
    opportunity: 'A research programme needs partners',
    contributors: [
      { key: 'finance', brings: 'funds the trial' },
      { key: 'technology', brings: 'handles the data' },
      { key: 'academy', brings: 'trains the staff' },
    ],
    outcome: 'A funded programme',
  },
];

const PHASES = [
  { key: 'discover', n: '01', label: 'Discover' },
  { key: 'connect', n: '02', label: 'Connect' },
  { key: 'collaborate', n: '03', label: 'Collaborate' },
  { key: 'create', n: '04', label: 'Create' },
  { key: 'grow', n: '05', label: 'Grow' },
] as const;

const PHASE_MS = 2100;

/**
 * Carries a child around the ring by translating it, so whatever is inside
 * stays upright. `baseX`/`baseY` are the element's resting coordinates; the
 * translation is the delta from there to the current orbital angle, which is
 * zero at spin = 0 and keeps SSR output identical to the first client frame.
 */
function OrbitAt({
  spin,
  angle,
  baseX,
  baseY,
  radius = R_NODE,
  calm,
  children,
}: {
  spin: MotionValue<number>;
  angle: number;
  baseX: number;
  baseY: number;
  radius?: number;
  calm: boolean;
  children: React.ReactNode;
}) {
  const x = useTransform(spin, (v) => r2(C + radius * Math.cos(((angle + v) * Math.PI) / 180) - baseX));
  const y = useTransform(spin, (v) => r2(C + radius * Math.sin(((angle + v) * Math.PI) / 180) - baseY));

  return <motion.g style={{ x, y }}>{children}</motion.g>;
}

/* ── Component ────────────────────────────────────── */

export default function HeroStage() {
  const calm = useCalm();
  const compact = useMediaQuery('(max-width: 720px)');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { amount: 0.3 });

  const [tick, setTick] = useState(0);
  // Which sector the core is previewing. Set by hovering a chip, cleared
  // only when the pointer leaves the whole stage - so you can travel from
  // the chip to the core to click it without the preview vanishing.
  const [preview, setPreview] = useState<string | null>(null);

  // The wheel turns continuously - no hover, no scroll, no interaction. One
  // MotionValue drives it so every chip can counter-rotate by exactly the
  // same angle and keep its label upright while it orbits.
  const spin = useMotionValue(0);
  // The rim turns the other way at a third of the speed - parallax between
  // the two makes the wheel read as an object rather than a flat graphic.
  const rimSpin = useTransform(spin, (v) => -v / 3);

  // Whichever sector is currently passing under the needle. Spacing is 30°,
  // so at 44s per revolution this changes every ~3.7s.
  const [needleIdx, setNeedleIdx] = useState(0);
  const lastNeedle = useRef(0);

  useMotionValueEvent(spin, 'change', (v) => {
    let best = 0;
    let bestDist = Infinity;
    NODES.forEach((n, i) => {
      // shortest angular distance from this chip to the needle
      // shortest angular distance from this chip to the needle, 0 = aligned
      const d = Math.abs(((((n.angle + v - NEEDLE_DEG) % 360) + 540) % 360) - 180);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    if (best !== lastNeedle.current) {
      lastNeedle.current = best;
      setNeedleIdx(best);
    }
  });

  const spinControls = useRef<{ pause: () => void; play: () => void } | null>(null);

  // Deliberately NOT gated on `calm`. Every other animation here still
  // honours prefers-reduced-motion; the wheel is an explicit product
  // decision, and runs at half speed under that setting to soften it.
  useEffect(() => {
    if (!inView) return;
    const controls = animate(spin, 360, {
      duration: calm ? 68 : 34,
      ease: 'linear',
      repeat: Infinity,
      repeatType: 'loop',
    });
    spinControls.current = controls;
    return () => {
      controls.stop();
      spinControls.current = null;
    };
  }, [calm, inView, spin]);

  // One timer drives the whole stage. It stops when the hero
  // scrolls away, so nothing animates off-screen.
  useEffect(() => {
    if (calm || !inView) return;
    const id = setInterval(() => setTick((t) => t + 1), PHASE_MS);
    return () => clearInterval(id);
  }, [calm, inView]);

  const scenario = SCENARIOS[Math.floor(tick / PHASES.length) % SCENARIOS.length];
  const phaseIdx = calm ? 2 : tick % PHASES.length;
  const phase = PHASES[phaseIdx].key;

  const origin = nodeOf(scenario.origin);
  const contributors = scenario.contributors.map((c) => ({ ...c, node: nodeOf(c.key) }));

  const hoverNode = preview ? NODES.find((n) => n.key === preview) ?? null : null;
  // The needle's pick is the default; a deliberate hover wins over it.
  const previewNode = hoverNode ?? NODES[needleIdx] ?? null;

  const created = !calm && phaseIdx >= 3;

  return (
    <div
      className="lp-stage"
      ref={wrapRef}
      onPointerEnter={() => spinControls.current?.pause()}
      onPointerLeave={() => {
        spinControls.current?.play();
        setPreview(null);
      }}
    >
      <svg
        className="lp-stage-svg"
        viewBox={`0 0 ${BOX} ${BOX}`}
        /* `group`, not `img`: the sector chips are real controls now, and
           role="img" would hide them from assistive technology. */
        role="group"
        aria-label="Twelve industry sectors around the community core. Choose a sector to open it in the industries showcase."
      >
        <defs>
          <linearGradient id="lp-chip-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.028)" />
          </linearGradient>
          <linearGradient id="lp-chip-grad-on" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(200,168,75,0.30)" />
            <stop offset="100%" stopColor="rgba(200,168,75,0.10)" />
          </linearGradient>
          <clipPath id="lp-core-clip">
            <circle cx={C} cy={C} r={R_CORE} />
          </clipPath>
          <radialGradient id="lp-rim-glow" cx="50%" cy="50%" r="50%">
            <stop offset="72%" stopColor="rgba(200,168,75,0)" />
            <stop offset="94%" stopColor="rgba(200,168,75,0.12)" />
            <stop offset="100%" stopColor="rgba(200,168,75,0)" />
          </radialGradient>
        </defs>

        {/* Rings - the instrument the sectors sit on */}
        <g className="lp-stage-rings" aria-hidden>
          <circle cx={C} cy={C} r={R_RIM} fill="url(#lp-rim-glow)" />
          <circle cx={C} cy={C} r={R_RIM} className="lp-ring-rim" />
          <circle cx={C} cy={C} r={R_NODE} className="lp-ring-line" />
          <circle cx={C} cy={C} r={R_NODE - 58} className="lp-ring-line lp-ring-line-dash" />
          <circle cx={C} cy={C} r={R_NODE - 116} className="lp-ring-line" />

          {/* Dial ticks, turning against the wheel for depth */}
          {/* `transform-box: fill-box` (in CSS) makes the origin the group's
              own centre. A px transform-origin on an SVG group does not
              resolve to the ring centre and the whole dial walks off. */}
          <motion.g className="lp-tick-ring" style={{ rotate: rimSpin }}>
            {TICKS.map((t) => (
              <line
                key={t.deg}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                className={t.major ? 'lp-tick lp-tick-major' : 'lp-tick'}
              />
            ))}
          </motion.g>

          {!calm && (
            <motion.circle
              cx={C}
              cy={C}
              r={R_NODE - 58}
              className="lp-ring-sweep"
              style={{ originX: '50%', originY: '50%' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 46, ease: 'linear', repeat: Infinity }}
            />
          )}
        </g>

        {/* Core - the community mark at rest; the hovered sector's photograph
            when one is being previewed, and clickable to open it. */}
        <g>
          <motion.g
            animate={{ scale: created ? 1.06 : 1 }}
            style={{ originX: `${C}px`, originY: `${C}px` }}
            transition={{ duration: 0.7, ease: EASE.arrive }}
            className={previewNode ? 'lp-core-live' : undefined}
            role={previewNode ? 'button' : undefined}
            tabIndex={previewNode ? 0 : undefined}
            aria-label={previewNode ? `Open ${previewNode.name} in the industries showcase` : undefined}
            onClick={previewNode ? () => openSector(previewNode.key) : undefined}
            onKeyDown={
              previewNode
                ? (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openSector(previewNode.key);
                    }
                  }
                : undefined
            }
          >
            <motion.circle
              cx={C}
              cy={C}
              r={R_CORE}
              className="lp-core-disc"
              animate={{ r: previewNode ? R_CORE_OPEN : R_CORE }}
              transition={{ duration: calm ? 0 : 0.45, ease: EASE.arrive }}
            />

            <AnimatePresence>
              {previewNode && (
                <motion.g
                  key={previewNode.key}
                  clipPath="url(#lp-core-clip)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: calm ? 0 : 0.45, ease: EASE.out }}
                >
                  <image
                    href={previewNode.image}
                    x={C - R_CORE - 4}
                    y={C - R_CORE - 4}
                    width={R_CORE * 2 + 8}
                    height={R_CORE * 2 + 8}
                    preserveAspectRatio="xMidYMid slice"
                    className="lp-core-photo"
                  />
                  <rect x={C - 104} y={C + 34} width={208} height={70} className="lp-core-photo-veil" />
                  {(() => {
                    // The circle narrows as the caption drops, so the usable
                    // width shrinks line by line: ~182px, ~159px, ~122px.
                    const lines = wrapLabel(previewNode.name, 16, 3);
                    const top = lines.length >= 3 ? C + 50 : lines.length === 2 ? C + 58 : C + 68;
                    const lead = lines.length >= 3 ? 17 : 19;
                    return (
                      <text x={C} y={top} className="lp-core-photo-name" textAnchor="middle">
                        {lines.map((ln, li) => (
                          <tspan key={ln} x={C} dy={li === 0 ? 0 : lead}>
                            {ln}
                          </tspan>
                        ))}
                      </text>
                    );
                  })()}
                </motion.g>
              )}
            </AnimatePresence>

            <motion.circle
              cx={C}
              cy={C}
              r={R_CORE}
              className="lp-core-edge"
              animate={{ r: previewNode ? R_CORE_OPEN : R_CORE }}
              transition={{ duration: calm ? 0 : 0.45, ease: EASE.arrive }}
            />
          </motion.g>

          {/* Pulse rings on create/grow */}
          <AnimatePresence>
            {created && !calm && (
              <motion.circle
                key={`pulse-${tick}`}
                cx={C}
                cy={C}
                r={54}
                className="lp-core-pulse"
                initial={{ scale: 1, opacity: 0.55 }}
                animate={{ scale: 2.4, opacity: 0 }}
                exit={{ opacity: 0 }}
                style={{ originX: '50%', originY: '50%' }}
                transition={{ duration: 1.6, ease: EASE.out }}
              />
            )}
          </AnimatePresence>
        </g>

        {/* The needle - fixed at 12 o'clock while the wheel turns beneath it.
            Whatever sector passes under it is what the core shows. */}
        <g className="lp-needle" aria-hidden>
          <line x1={C} y1={C - R_CORE - 8} x2={C} y2={C - R_NODE + 26} className="lp-needle-stem" />
          <path
            d={`M ${C} ${C - R_NODE + 12} l 7 14 l -7 -5 l -7 5 z`}
            className="lp-needle-head"
          />
          <circle cx={C} cy={C - R_CORE - 8} r={3.5} className="lp-needle-hub" />
        </g>

        {/* The community mark, seated on the core's lower edge so the sector
            photograph keeps the middle. */}
    

        {/* Sector chips - carried around the orbit by translation, not by
            rotating a parent. Rotating would tip every label upside down and
            need a counter-rotation whose origin is fiddly to get right in SVG
            user space; translating keeps them upright for free. */}
        <g>
          {NODES.map((n, i) => {
            return (
              <OrbitAt key={n.key} spin={spin} angle={n.angle} baseX={n.x} baseY={n.y} calm={calm}>
              <motion.g
                className={`lp-node-g is-pickable ${
                  previewNode?.key === n.key ? 'is-active' : ''
                }`}
                role="button"
                tabIndex={0}
                aria-label={`${n.short} - open in the industries showcase`}
                onClick={() => openSector(n.key)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openSector(n.key);
                  }
                }}
                onPointerEnter={() => setPreview(n.key)}
                onFocus={() => {
                  spinControls.current?.pause();
                  setPreview(n.key);
                }}
                onBlur={() => {
                  spinControls.current?.play();
                  setPreview(null);
                }}
                initial={calm ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: calm ? 0 : 0.6,
                  ease: EASE.out,
                  delay: calm ? 0 : 0.5 + i * 0.05,
                  scale: { duration: calm ? 0 : 0.5, ease: EASE.arrive },
                }}
                style={{ originX: `${n.x}px`, originY: `${n.y}px` }}
              >
                {compact ? (
                  <>
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={22}
                      className="lp-node-dot"
                      fill="url(#lp-chip-grad)"
                    />
                    <text x={n.x} y={n.y + 6} className="lp-node-icon" textAnchor="middle">
                      {n.icon}
                    </text>
                  </>
                ) : (
                  <>
                    {(() => {
                      const lines = wrapLabel(n.short);
                      const two = lines.length > 1;
                      const h = two ? 48 : 36;
                      return (
                        <>
                          <rect
                            x={n.x - 54}
                            y={n.y - h / 2}
                            width={108}
                            height={h}
                            rx={two ? 16 : 18}
                            className="lp-node-chip"
                            fill="url(#lp-chip-grad)"
                          />
                          <text
                            x={n.x - 37}
                            y={n.y + 5}
                            className="lp-node-icon"
                            textAnchor="middle"
                          >
                            {n.icon}
                          </text>
                          <text x={n.x - 24} y={two ? n.y - 2 : n.y + 4} className="lp-node-label">
                            {lines.map((ln, li) => (
                              <tspan key={ln} x={n.x - 24} dy={li === 0 ? 0 : 13}>
                                {ln}
                              </tspan>
                            ))}
                          </text>
                        </>
                      );
                    })()}
                  </>
                )}
              </motion.g>
              </OrbitAt>
            );
          })}
        </g>

        {/* The opportunity token travelling in, then the outcome it becomes */}
        {!calm && (
          <AnimatePresence mode="wait">
            {phaseIdx === 0 && (
              <motion.g
                key={`tok-birth-${tick}`}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                style={{ originX: `${origin.x}px`, originY: `${origin.y}px` }}
                transition={{ duration: 0.5, ease: EASE.arrive }}
                aria-hidden
              >
                <circle cx={origin.x} cy={origin.y} r={9} className="lp-token" />
              </motion.g>
            )}
            {phaseIdx === 1 && (
              <motion.circle
                key={`tok-travel-${tick}`}
                r={9}
                className="lp-token"
                initial={{ cx: origin.x, cy: origin.y, opacity: 1 }}
                animate={{ cx: C, cy: C, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: EASE.out }}
                aria-hidden
              />
            )}
          </AnimatePresence>
        )}

        {/* Contribution labels around the ring */}
        {!calm && (
          <AnimatePresence>
            {phaseIdx === 2 &&
              contributors.map((c, i) => {
                const rad = (c.node.angle * Math.PI) / 180;
                const lx = r2(C + (R_NODE - 74) * Math.cos(rad));
                const ly = r2(C + (R_NODE - 74) * Math.sin(rad));
                return (
                  <OrbitAt
                    key={`brings-${c.key}-${tick}`}
                    spin={spin}
                    angle={c.node.angle}
                    baseX={lx}
                    baseY={ly}
                    radius={R_NODE - 74}
                    calm={calm}
                  >
                  <motion.text
                    x={lx}
                    y={ly}
                    className="lp-brings"
                    textAnchor="middle"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE.out, delay: 0.2 + i * 0.12 }}
                    aria-hidden
                  >
                    {c.brings}
                  </motion.text>
                  </OrbitAt>
                );
              })}
          </AnimatePresence>
        )}
      </svg>

      {/* Caption - names the phase and the story beat in words */}
      <div className="lp-stage-caption">
        <div className="lp-stage-rail" aria-hidden>
          {PHASES.map((p, i) => (
            <span
              key={p.key}
              className={`lp-stage-rail-seg ${i <= phaseIdx ? 'lp-stage-rail-on' : ''}`}
            />
          ))}
        </div>

        {calm ? (
          <div className="lp-stage-text">
            <span className="lp-stage-phase">Discover → Connect → Collaborate → Create → Grow</span>
            <span className="lp-stage-beat">
              An opportunity raised by one member draws in the members who can contribute to it.
            </span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              className="lp-stage-text"
              key={`${phase}-${tick}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: EASE.out }}
            >
              <span className="lp-stage-phase">
                <span className="lp-stage-phase-n">{PHASES[phaseIdx].n}</span>
                {PHASES[phaseIdx].label}
              </span>
              <span className="lp-stage-beat">
                {phaseIdx === 0 && scenario.opportunity}
                {phaseIdx === 1 && 'Members whose business is relevant see it.'}
                {phaseIdx === 2 &&
                  contributors.map((c) => c.brings).join(' · ')}
                {phaseIdx === 3 && scenario.outcome}
                {phaseIdx === 4 && 'Every business involved grows.'}
              </span>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <p className="lp-stage-note">Illustrative - showing how an opportunity moves through the community.</p>
    </div>
  );
}
