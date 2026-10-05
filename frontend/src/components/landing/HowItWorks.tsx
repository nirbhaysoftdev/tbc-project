'use client';
// src/components/landing/HowItWorks.tsx - 04 · How the community works
//
// Not a five-step infographic: a spine you scroll through. The active step
// is whichever one the reader is looking at; it opens, its contributions
// animate in, and the spine fills behind it. The rail is also a control -
// each marker jumps to its step.

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'motion/react';
import { FLOW } from '@/lib/landing-data';
import { EASE, Reveal, SplitWordsInView, enterInView, useCalm } from './motion';

export default function HowItWorks() {
  const calm = useCalm();
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLElement | null)[]>([]);

  const handleEnter = useCallback((i: number) => setActive(i), []);

  const jumpTo = useCallback((i: number) => {
    stepRefs.current[i]?.scrollIntoView({
      behavior: calm ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [calm]);

  return (
    <section id="how-it-works" className="lp-section lp-flow-section">
      <div className="lp-section-head">
        <Reveal className="lp-tag">How it works</Reveal>
        <h2 className="lp-section-title">
          <SplitWordsInView text="One opportunity, five moves." />
        </h2>
        <Reveal className="lp-section-sub" delay={0.1}>
          This is the loop the community runs on. It starts with one member noticing something.
        </Reveal>
      </div>

      <div className="lp-flow">
        {/* Rail */}
        <nav className="lp-flow-rail" aria-label="Steps">
          <span className="lp-flow-rail-line" aria-hidden />
          <motion.span
            className="lp-flow-rail-fill"
            aria-hidden
            animate={{ scaleY: (active + 1) / FLOW.length }}
            transition={{ duration: calm ? 0 : 0.6, ease: EASE.out }}
          />
          {FLOW.map((s, i) => (
            <button
              key={s.key}
              className={`lp-flow-marker ${i <= active ? 'lp-flow-marker-on' : ''} ${i === active ? 'lp-flow-marker-now' : ''}`}
              onClick={() => jumpTo(i)}
              aria-label={`Go to step ${s.n}: ${s.title}`}
              aria-current={i === active ? 'step' : undefined}
            >
              <span className="lp-flow-marker-n">{s.n}</span>
              <span className="lp-flow-marker-t">{s.title}</span>
            </button>
          ))}
        </nav>

        {/* Steps */}
        <div className="lp-flow-steps">
          {FLOW.map((s, i) => (
            <FlowStep
              key={s.key}
              step={s}
              index={i}
              isActive={i === active}
              calm={calm}
              onEnter={handleEnter}
              register={(el) => {
                stepRefs.current[i] = el;
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowStep({
  step,
  index,
  isActive,
  calm,
  onEnter,
  register,
}: {
  step: (typeof FLOW)[number];
  index: number;
  isActive: boolean;
  calm: boolean;
  onEnter: (index: number) => void;
  register: (el: HTMLElement | null) => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { amount: 0.6 });

  // Claim "active" while this step holds the middle of the viewport.
  useEffect(() => {
    if (inView) onEnter(index);
  }, [inView, index, onEnter]);

  const open = calm || isActive;

  return (
    <motion.article
      ref={(el: HTMLElement | null) => {
        ref.current = el;
        register(el);
      }}
      className={`lp-flow-step ${open ? 'lp-flow-step-open' : ''}`}
      {...enterInView(calm, { opacity: 0, y: 30 }, { duration: 0.75, ease: EASE.out })}
    >
      <div className="lp-flow-step-head">
        <span className="lp-flow-step-n" aria-hidden>
          {step.n}
        </span>
        <div>
          <h3 className="lp-flow-step-title">{step.title}</h3>
          <p className="lp-flow-step-line">{step.line}</p>
        </div>
      </div>

      <p className="lp-flow-step-body">{step.body}</p>

      {/* Chips stay mounted so an inactive step does not reserve an empty
          gap where they used to be; the active state is carried by opacity
          and the card's border instead of by mounting and unmounting. */}
      <ul className="lp-chips">
        {step.chips.map((c, ci) => (
          <motion.li
            className="lp-chip"
            key={c}
            initial={calm ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: open ? 1 : 0.32, y: 0 }}
            transition={{
              duration: calm ? 0 : 0.45,
              ease: EASE.arrive,
              delay: calm || !open ? 0 : ci * 0.07,
            }}
          >
            {c}
          </motion.li>
        ))}
      </ul>

      {index < FLOW.length - 1 && (
        <span className="lp-flow-step-arrow" aria-hidden>
          ↓
        </span>
      )}
    </motion.article>
  );
}
