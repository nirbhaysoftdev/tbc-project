'use client';
// src/components/landing/Stats.tsx
// Count-ups driven by Motion's animate(), so they inherit the same easing as
// everything else and land on the exact target. Static under reduced motion.

import { useEffect, useRef, useState, useMemo} from 'react';
import { animate, useInView } from 'motion/react';
import { getStats } from '@/lib/landing-data';

/** One stat, as getStats() returns it. */
type StatItem = ReturnType<typeof getStats>[number];
import { EASE, useCalm } from './motion';
import { useTranslation } from 'react-i18next';

export default function Stats() {
  const { t } = useTranslation('landing');
  const STATS = useMemo(() => getStats(t), [t]);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <section className="lp-stats-section" ref={ref}>
      <div className="lp-stats">
        {STATS.map((s, i) => (
          <Stat key={s.key} stat={s} active={inView} delay={i * 0.12} />
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
  stat: StatItem;
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
