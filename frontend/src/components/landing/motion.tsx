'use client';
// src/components/landing/motion.tsx
// Shared Motion.dev primitives for the landing experience.
// Every primitive degrades to an instant, static state under prefers-reduced-motion.

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type TargetAndTransition,
  type Transition,
  type Variants,
} from 'motion/react';
import {
  createContext,
  Fragment,
  useRef,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/* ── Motion language ──────────────────────────────
   One easing vocabulary for the whole page so the
   experience reads as a single, intentional system. */

export const EASE = {
  /** expo-out - the default: fast start, long elegant settle */
  out: [0.16, 1, 0.3, 1] as const,
  /** gentle in-out for reversible state changes */
  soft: [0.4, 0, 0.2, 1] as const,
  /** slight overshoot for objects that "arrive" */
  arrive: [0.34, 1.32, 0.64, 1] as const,
};

export const DUR = {
  fast: 0.28,
  base: 0.55,
  slow: 0.85,
  story: 1.2,
};

export const T = {
  base: { duration: DUR.base, ease: EASE.out } satisfies Transition,
  slow: { duration: DUR.slow, ease: EASE.out } satisfies Transition,
  fast: { duration: DUR.fast, ease: EASE.soft } satisfies Transition,
  arrive: { duration: DUR.base, ease: EASE.arrive } satisfies Transition,
};

/* ── Reduced motion ───────────────────────────────
   Several components render a *different element tree* when calm
   (plain text instead of per-word spans, a grid instead of a marquee).
   `useReducedMotion` resolves synchronously on the client, so returning
   it directly would make a reduced-motion visitor's first client render
   disagree with the server's HTML and break hydration.

   Holding it false until after mount keeps the first render identical to
   the static export, then swaps in the calm tree on the next commit. The
   CSS `prefers-reduced-motion` block neutralises the CSS-driven loops
   from the very first paint regardless. */

export function useCalm() {
  const reduced = useReducedMotion() ?? false;
  const mounted = useMounted();
  return mounted && reduced;
}

/* ── Entrance props ───────────────────────────────
   Because `calm` flips *after* hydration, a motion element cannot simply
   drop its `initial`/`animate` when calm: the server already wrote the
   `initial` state (opacity: 0) into the HTML as an inline style, and a
   motion element handed `undefined` stops managing that style rather than
   clearing it - so the element would stay invisible forever.

   These helpers always hand back an explicit resting state, so the calm
   path actively paints the element visible instead of abandoning it. Use
   them for every mount/scroll entrance rather than `calm ? undefined : …`. */

export const REST = { opacity: 1, x: 0, y: 0, scale: 1 };

type From = TargetAndTransition;

/** Entrance that runs on mount. */
export function enter(calm: boolean, from: From, transition: Transition = T.slow) {
  return calm
    ? { initial: false as const, animate: REST, transition: { duration: 0 } }
    : { initial: from, animate: REST, transition };
}

/** Entrance that runs when the element scrolls into view. */
export function enterInView(
  calm: boolean,
  from: From,
  transition: Transition = T.slow,
  viewport: { once?: boolean; amount?: number } = { once: true, amount: 0.3 },
) {
  return calm
    ? { initial: false as const, animate: REST, transition: { duration: 0 } }
    : { initial: from, whileInView: REST, viewport, transition };
}

/** Mobile/low-power check used to simplify the heaviest visuals. */
const CompactContext = createContext(false);
export const CompactProvider = CompactContext.Provider;
export const useCompact = () => useContext(CompactContext);

/**
 * SSR-safe media query. Starts `false` so the static export and the first
 * client paint agree, then corrects on mount.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True once the component has mounted on the client. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/* ── Scroll-linked motion ─────────────────────────
   Entrance animations fire once; these keep moving with the scroll, which
   is what makes a long page feel alive rather than merely animated on
   arrival. Deliberately small distances - intent, not aggressive parallax -
   and spring-smoothed so they never feel jittery. */

/**
 * Drifts its children against the scroll direction while in view.
 * `distance` is total travel in pixels, split either side of centre.
 */
export function Parallax({
  children,
  distance = 56,
  axis = 'y',
  className,
}: {
  children: ReactNode;
  distance?: number;
  axis?: 'x' | 'y';
  className?: string;
}) {
  const calm = useCalm();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const raw = useTransform(scrollYProgress, [0, 1], [distance / 2, -distance / 2]);
  const offset = useSpring(raw, { stiffness: 110, damping: 30, restDelta: 0.5 });

  if (calm) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      <motion.div style={axis === 'y' ? { y: offset } : { x: offset }}>{children}</motion.div>
    </div>
  );
}

/* ── Reveal ───────────────────────────────────────
   Scroll-triggered entrance. Replaces the old
   IntersectionObserver + `.lp-visible` class dance. */

type Dir = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSET: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: 28 },
  down: { x: 0, y: -28 },
  left: { x: 28, y: 0 },
  right: { x: -28, y: 0 },
  none: { x: 0, y: 0 },
};

export function Reveal({
  children,
  as = 'div',
  dir = 'up',
  delay = 0,
  duration = DUR.slow,
  amount = 0.2,
  once = true,
  className,
  style,
  ...rest
}: {
  children: ReactNode;
  as?: 'div' | 'section' | 'article' | 'header' | 'li' | 'span' | 'p' | 'h2' | 'h3';
  dir?: Dir;
  delay?: number;
  duration?: number;
  amount?: number;
  once?: boolean;
  className?: string;
  style?: React.CSSProperties;
} & Record<string, unknown>) {
  const calm = useCalm();
  const Tag = motion[as] as typeof motion.div;
  const off = OFFSET[dir];

  if (calm) {
    const Plain = as as 'div';
    return (
      <Plain className={className} style={style} {...(rest as object)}>
        {children}
      </Plain>
    );
  }

  return (
    <Tag
      className={className}
      style={style}
      initial={{ opacity: 0, x: off.x, y: off.y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, amount }}
      transition={{ duration, ease: EASE.out, delay }}
      {...(rest as object)}
    >
      {children}
    </Tag>
  );
}

/* ── Stagger group ────────────────────────────────
   Parent orchestrates, children inherit. Cheaper than
   hand-computing a transitionDelay per card. */

export const staggerParent = (stagger = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: stagger, delayChildren } },
});

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: T.slow },
};

export function StaggerGroup({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0,
  amount = 0.15,
  as = 'div',
  style,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  amount?: number;
  as?: 'div' | 'ul' | 'section';
  style?: React.CSSProperties;
}) {
  const calm = useCalm();
  const Tag = motion[as] as typeof motion.div;

  if (calm) {
    const Plain = as as 'div';
    return (
      <Plain className={className} style={style}>
        {children}
      </Plain>
    );
  }

  return (
    <Tag
      className={className}
      style={style}
      variants={staggerParent(stagger, delayChildren)}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'div',
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'li' | 'span';
  style?: React.CSSProperties;
} & Record<string, unknown>) {
  const calm = useCalm();
  const Tag = motion[as] as typeof motion.div;

  if (calm) {
    const Plain = as as 'div';
    return (
      <Plain className={className} style={style} {...(rest as object)}>
        {children}
      </Plain>
    );
  }

  return (
    <Tag className={className} style={style} variants={staggerChild} {...(rest as object)}>
      {children}
    </Tag>
  );
}

/* ── Split headline ───────────────────────────────
   Word-by-word rise. Kept to whole words (not letters) so screen
   readers and text selection stay intact.

   Two details that are easy to get wrong:
   - The inter-word space must be a sibling of the clipping wrapper, not
     a child of it. Inside an `overflow: hidden` inline-block it collapses
     and the words run together ("Differentideas").
   - Gradient text (`background-clip: text`) cannot be split: each word
     becomes its own box, so the gradient restarts per word or the text
     paints transparent over nothing and disappears. Pass `split={false}`
     for those and the phrase rises as a single unit. */

export function SplitWords({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.045,
  split = true,
  as: Tag = 'span',
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  split?: boolean;
  as?: 'span' | 'h1' | 'h2';
}) {
  const calm = useCalm();
  const words = text.split(' ');

  if (calm) return <Tag className={className}>{text}</Tag>;

  if (!split) {
    return (
      <Tag className={className}>
        <span className="lp-word">
          <motion.span
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay }}
          >
            {text}
          </motion.span>
        </span>
      </Tag>
    );
  }

  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span className="lp-word" aria-hidden>
            <motion.span
              className={wordClassName}
              initial={{ y: '110%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              transition={{ duration: DUR.slow, ease: EASE.out, delay: delay + i * stagger }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </Tag>
  );
}

/** Same rise, but triggered by scroll instead of mount. */
export function SplitWordsInView({
  text,
  className,
  delay = 0,
  stagger = 0.045,
  split = true,
  as: Tag = 'span',
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  split?: boolean;
  as?: 'span' | 'h2' | 'h3';
}) {
  const calm = useCalm();
  const words = text.split(' ');
  const MotionTag = motion[Tag] as typeof motion.span;

  if (calm) return <Tag className={className}>{text}</Tag>;

  if (!split) {
    return (
      <Tag className={className}>
        <span className="lp-word">
          <motion.span
            initial={{ y: '110%', opacity: 0 }}
            whileInView={{ y: '0%', opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: DUR.slow, ease: EASE.out, delay }}
          >
            {text}
          </motion.span>
        </span>
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      aria-label={text}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.4 }}
      variants={staggerParent(stagger, delay)}
    >
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span className="lp-word" aria-hidden>
            <motion.span
              variants={{
                hidden: { y: '110%', opacity: 0 },
                shown: { y: '0%', opacity: 1, transition: { duration: DUR.slow, ease: EASE.out } },
              }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </MotionTag>
  );
}
