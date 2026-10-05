'use client';
// src/components/landing/IsoArt.tsx
//
// Isometric illustrations for the "Why join" cards, drawn as SVG rather than
// rendered as images: crisp at any size, no payload, on-palette by
// construction, and each piece can animate independently.
//
// True isometric projection (30°): a point in world space (x, y, z) maps to
// screen (x − y)·cos30, (x + y)·sin30 − z. Every scene is composed from
// cuboids so the lighting stays consistent - top faces brightest, left
// faces mid, right faces darkest.

import { motion } from 'motion/react';
import { EASE } from './motion';

const COS30 = 0.8660254;

type Pt = [number, number];

const proj = (x: number, y: number, z: number): Pt => [
  (x - y) * COS30,
  (x + y) * 0.5 - z,
];

const poly = (pts: Pt[]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/** The three visible faces of an axis-aligned cuboid. */
function faces(x: number, y: number, z: number, w: number, d: number, h: number) {
  const p = (dx: number, dy: number, dz: number) => proj(x + dx, y + dy, z + dz);
  return {
    top: poly([p(0, 0, h), p(w, 0, h), p(w, d, h), p(0, d, h)]),
    left: poly([p(0, d, h), p(w, d, h), p(w, d, 0), p(0, d, 0)]),
    right: poly([p(w, 0, h), p(w, d, h), p(w, d, 0), p(w, 0, 0)]),
  };
}

type BoxProps = {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tone?: 'base' | 'gold' | 'ghost';
};

function Box({ tone = 'base', ...b }: BoxProps) {
  const f = faces(b.x, b.y, b.z, b.w, b.d, b.h);
  return (
    <g className={`iso-${tone}`}>
      <polygon points={f.left} className="iso-f-left" />
      <polygon points={f.right} className="iso-f-right" />
      <polygon points={f.top} className="iso-f-top" />
    </g>
  );
}

/** A cuboid that rises into place when the card scrolls in. */
function LiftBox({
  delay = 0,
  lift = 16,
  calm,
  ...b
}: BoxProps & { delay?: number; lift?: number; calm: boolean }) {
  return (
    <motion.g
      initial={calm ? false : { opacity: 0, y: lift }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: calm ? 0 : 0.6, ease: EASE.arrive, delay: calm ? 0 : delay }}
    >
      <Box {...b} />
    </motion.g>
  );
}

/* ── Scenes ───────────────────────────────────────── */

export type IsoKind =
  | 'early'
  | 'direct'
  | 'inbound'
  | 'partner'
  | 'supply'
  | 'expertise'
  | 'intro'
  | 'idea'
  | 'market';

export default function IsoArt({ kind, calm }: { kind: IsoKind; calm: boolean }) {
  return (
    // Tight to the widest scene ('inbound', which reaches ±70 on screen x)
    // so the art fills its cell instead of floating in empty canvas.
    <svg className="lp-iso" viewBox="-76 -54 152 102" role="img" aria-hidden>
      <Scene kind={kind} calm={calm} />
    </svg>
  );
}

function Scene({ kind, calm }: { kind: IsoKind; calm: boolean }) {
  switch (kind) {
    /* Work surfacing before it is public: a stack of plans on a plinth,
       the top sheet lifted clear and lit. */
    case 'early':
      return (
        <>
          <Box x={-26} y={-26} z={0} w={52} d={52} h={5} tone="ghost" />
          <LiftBox calm={calm} x={-20} y={-20} z={5} w={40} d={40} h={4} delay={0.05} />
          <LiftBox calm={calm} x={-18} y={-18} z={9} w={36} d={36} h={4} delay={0.12} />
          <LiftBox calm={calm} x={-16} y={-16} z={22} w={32} d={32} h={4} tone="gold" delay={0.24} lift={26} />
        </>
      );

    /* Capital across the table: two tall parties face each other and the
       span runs straight between them - the gap beneath it is the point. */
    case 'direct':
      return (
        <>
          <LiftBox calm={calm} x={-30} y={-14} z={0} w={20} d={28} h={26} delay={0.05} />
          <LiftBox calm={calm} x={10} y={-14} z={0} w={20} d={28} h={26} tone="gold" delay={0.12} />
          <LiftBox calm={calm} x={-10} y={-6} z={22} w={20} d={12} h={4} tone="gold" delay={0.26} lift={12} />
        </>
      );

    /* Referrals arriving: four blocks converging on a raised platform. */
    case 'inbound':
      return (
        <>
          <LiftBox calm={calm} x={-14} y={-14} z={0} w={28} d={28} h={14} tone="gold" delay={0.2} />
          <LiftBox calm={calm} x={-40} y={-40} z={0} w={14} d={14} h={6} delay={0} />
          <LiftBox calm={calm} x={26} y={-40} z={0} w={14} d={14} h={6} delay={0.07} />
          <LiftBox calm={calm} x={-40} y={26} z={0} w={14} d={14} h={6} delay={0.14} />
          <LiftBox calm={calm} x={26} y={26} z={0} w={14} d={14} h={6} delay={0.21} />
        </>
      );

    /* Two halves that only work together. */
    case 'partner':
      return (
        <>
          <LiftBox calm={calm} x={-24} y={-16} z={0} w={22} d={32} h={16} delay={0.05} />
          <LiftBox calm={calm} x={2} y={-16} z={0} w={22} d={32} h={16} tone="gold" delay={0.14} />
        </>
      );

    /* A supply stack. */
    case 'supply':
      return (
        <>
          <LiftBox calm={calm} x={-24} y={-24} z={0} w={22} d={22} h={12} delay={0} />
          <LiftBox calm={calm} x={2} y={-24} z={0} w={22} d={22} h={12} delay={0.06} />
          <LiftBox calm={calm} x={-24} y={2} z={0} w={22} d={22} h={12} delay={0.12} />
          <LiftBox calm={calm} x={-11} y={-11} z={12} w={22} d={22} h={12} tone="gold" delay={0.22} />
        </>
      );

    /* Knowledge you borrow: a tall block beside a low one. */
    case 'expertise':
      return (
        <>
          <LiftBox calm={calm} x={-26} y={-12} z={0} w={20} d={24} h={30} tone="gold" delay={0.08} />
          <LiftBox calm={calm} x={0} y={-12} z={0} w={20} d={24} h={13} delay={0.02} />
        </>
      );

    /* An introduction: two parties far apart, and the member in the middle
       who is the reason the span exists at all. */
    case 'intro':
      return (
        <>
          <LiftBox calm={calm} x={-40} y={-12} z={0} w={20} d={24} h={10} delay={0} />
          <LiftBox calm={calm} x={20} y={-12} z={0} w={20} d={24} h={10} delay={0.06} />
          <LiftBox calm={calm} x={-8} y={-8} z={0} w={16} d={16} h={16} tone="gold" delay={0.2} />
          <LiftBox calm={calm} x={-20} y={-4} z={16} w={40} d={8} h={3} tone="ghost" delay={0.3} lift={10} />
        </>
      );

    /* An idea taking form on top of what is already there. */
    case 'idea':
      return (
        <>
          <LiftBox calm={calm} x={-20} y={-20} z={0} w={40} d={40} h={8} delay={0} />
          <LiftBox calm={calm} x={-8} y={-8} z={8} w={16} d={16} h={16} tone="gold" delay={0.16} lift={22} />
        </>
      );

    /* A new market: an outlying platform reached from the home one. */
    case 'market':
    default:
      return (
        <>
          <LiftBox calm={calm} x={-38} y={-10} z={0} w={24} d={24} h={10} delay={0} />
          <LiftBox calm={calm} x={10} y={-22} z={0} w={26} d={26} h={18} tone="gold" delay={0.16} lift={20} />
          <LiftBox calm={calm} x={-12} y={-2} z={0} w={20} d={6} h={2} tone="ghost" delay={0.1} />
        </>
      );
  }
}
