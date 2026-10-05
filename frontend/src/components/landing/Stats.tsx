'use client';
// src/components/landing/Stats.tsx
// Count-ups driven by Motion's animate(), so they inherit the same easing as
// everything else and land on the exact target. Static under reduced motion.

import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'motion/react';
import { STATS } from '@/lib/landing-data';
import { EASE, useCalm } from './motion';

export default function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <section className="lp-stats-section" ref={ref}>
      <div className="lp-stats">
        {STATS.map((s, i) => (
          <Stat key={s.label} stat={s} active={inView} delay={i * 0.12} />
        ))}
      </div>
    </section>
  );
}

function Stat({
  stat,
  active,
  delay,
}: {
  stat: (typeof STATS)[number];
  active: boolean;
  delay: number;
}) {
  const calm = useCalm();
  const [n, setN] = useState(calm ? stat.value : 0);

  useEffect(() => {
    if (calm) {
      setN(stat.value);
      return;
    }
    if (!active) return;
    const controls = animate(0, stat.value, {
      duration: 1.5,
      delay,
      ease: EASE.out,
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [active, calm, delay, stat.value]);

  return (
    <div className="lp-stat">
      <div className="lp-stat-value">
        <span>{n}</span>
        <span className="lp-stat-suffix">{stat.suffix}</span>
      </div>
      <div className="lp-stat-label">{stat.label}</div>
      <div className="lp-stat-sub">{stat.sub}</div>
    </div>
  );
}
