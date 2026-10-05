'use client';
// src/components/landing/WhatItIs.tsx - 02 · What is it?
//
// The hero shows the room; this section explains what happens in it. The
// opportunity-flow diagram moved here from the hero, where it now has space
// to be read alongside the definition rather than competing with a headline.

import { WHAT_IT_IS } from '@/lib/landing-data';
import HeroStage from './HeroStage';
import { Reveal, SplitWordsInView, StaggerGroup, StaggerItem } from './motion';

export default function WhatItIs() {
  return (
    <section id="what" className="lp-section lp-what">
      <div className="lp-what-grid">
        <div className="lp-what-copy">
          <Reveal className="lp-tag">{WHAT_IT_IS.tag}</Reveal>
          <h2 className="lp-section-title lp-align-left">
            <SplitWordsInView text={WHAT_IT_IS.title} />
          </h2>
          <Reveal className="lp-what-lead-text" delay={0.12}>
            {WHAT_IT_IS.lead}
          </Reveal>
          <Reveal className="lp-what-body" delay={0.18}>
            <p>{WHAT_IT_IS.body}</p>
          </Reveal>
        </div>

        <Reveal className="lp-what-visual" dir="left" delay={0.1} amount={0.15}>
          <HeroStage />
        </Reveal>
      </div>

      <StaggerGroup className="lp-marks" stagger={0.07}>
        {WHAT_IT_IS.marks.map((m) => (
          <StaggerItem className="lp-mark" key={m.k}>
            <span className="lp-mark-k">{m.k}</span>
            <span className="lp-mark-v">{m.v}</span>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}
