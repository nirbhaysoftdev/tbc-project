'use client';
// src/components/landing/Scenario.tsx - 05 · A worked business example
//
// The project is built, not diagrammed. A construction project enters the
// community and each member snaps one layer into place - capital at the
// foundation, brand at the top. The structure is only finished once all six
// have contributed, which is the argument the section is making.
//
// Desktop pins the structure and drives the build from scroll position.
// Narrow screens and reduced-motion get the finished structure immediately,
// with the same information in a linear read.

import { useRef, useState } from 'react';
import { motion, useScroll, useMotionValueEvent } from 'motion/react';
import { SCENARIO } from '@/lib/landing-data';
import ScenarioElevation from './ScenarioElevation';
import { EASE, Reveal, SplitWordsInView, useCalm, useMediaQuery } from './motion';

const LAYERS = SCENARIO.layers;
const N = LAYERS.length;

export default function Scenario() {
  const calm = useCalm();
  const compact = useMediaQuery('(max-width: 900px)');
  const trackRef = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState(0);

  // The scroll distance inside the track maps 1:1 onto layers added.
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    setBuilt(Math.max(0, Math.min(N, Math.ceil(v * N))));
  });

  // Static layouts never run the scroll machinery - everything is already up.
  const isStatic = compact || calm;
  const done = isStatic ? N : built;

  return (
    <section id="scenario" className="lp-section lp-scenario">
      <div className="lp-section-head">
        <Reveal className="lp-tag lp-tag-alt">{SCENARIO.tag}</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text={SCENARIO.title} />
        </h2>
        <Reveal className="lp-section-sub" delay={0.1}>
          {SCENARIO.sub}
        </Reveal>
      </div>

      <div ref={trackRef} className={isStatic ? 'lp-bld-static' : 'lp-bld-track'}>
        {isStatic ? (
          <>
            <Stack done={done} calm={calm} isStatic />
            <Ledger done={done} calm={calm} />
          </>
        ) : (
          <div className="lp-bld-sticky">
            <div className="lp-elev-wrap">
              <ScenarioElevation done={done} calm={calm} />
              <div className="lp-elev-meter">
                <span className="lp-elev-meter-n">{done}</span>
                <span className="lp-elev-meter-of">of {N} businesses involved</span>
                <span className="lp-elev-meter-bar" aria-hidden>
                  <span style={{ transform: `scaleX(${done / N})` }} />
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <Reveal className="lp-scn-closing" delay={0.15}>
        {SCENARIO.closing}
      </Reveal>
    </section>
  );
}

/* ── The structure ────────────────────────────────── */

function Stack({
  done,
  calm,
  isStatic = false,
}: {
  done: number;
  calm: boolean;
  isStatic?: boolean;
}) {
  const complete = done >= N;

  return (
    <div className="lp-bld-struct">
      {/* The building only gets its cap once everyone has contributed. */}
      <div className={`lp-bld-cap ${complete ? 'is-on' : ''}`}>
        <span className="lp-bld-cap-tick" aria-hidden>
          ✓
        </span>
        {SCENARIO.outcome}
      </div>

      {/* Listed top-down for reading order; flex-column-reverse puts the
          foundation at the bottom, where it belongs. */}
      <ol
        className="lp-bld-stack"
        aria-label={`${SCENARIO.opportunity}, assembled from six member contributions`}
      >
        {LAYERS.map((l, i) => {
          const on = i < done;
          return (
            <motion.li
              key={l.key}
              className={`lp-bld-layer lp-bld-fill-${l.fill} ${on ? 'is-on' : ''}`}
              initial={false}
              animate={on ? { opacity: 1, y: 0, scaleY: 1 } : { opacity: 0, y: 24, scaleY: 0.55 }}
              transition={{ duration: calm || isStatic ? 0 : 0.5, ease: EASE.arrive }}
            >
              <span className="lp-bld-layer-icon" aria-hidden>
                {l.icon}
              </span>
              <span className="lp-bld-layer-name">{l.layer}</span>
              <span className="lp-bld-layer-role">{l.role}</span>
              <span className="lp-bld-layer-brings">{l.brings}</span>
            </motion.li>
          );
        })}
      </ol>

      <div className="lp-bld-ground" aria-hidden />

      <div className="lp-bld-base">
        <span className="lp-bld-base-icon" aria-hidden>
          {SCENARIO.opportunityIcon}
        </span>
        <span className="lp-bld-base-label">{SCENARIO.opportunity}</span>
        <span className="lp-bld-base-note">enters the community</span>
      </div>
    </div>
  );
}

/* ── The ledger beside it ─────────────────────────── */

function Ledger({ done, calm }: { done: number; calm: boolean }) {
  return (
    <aside className="lp-bld-side">
     
    </aside>
  );
}
