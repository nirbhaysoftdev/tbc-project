'use client';
// src/app/page.tsx — Landing page
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const PILLARS = [
  {
    key: 'advantage',
    title: 'Advantage',
    icon: '⚡',
    body: 'TBC merges innovation, community, and financial growth into one seamless experience — an unfair edge for those inside the circle.',
  },
  {
    key: 'opportunity',
    title: 'Opportunity',
    icon: '🌐',
    body: 'Access exclusive business ventures, investment channels, and global collaborations that are otherwise impossible to reach alone.',
  },
  {
    key: 'profit',
    title: 'Profit',
    icon: '📈',
    body: 'Turn participation into measurable financial value through shared activities, referrals, and active project engagement.',
  },
];

const FEATURE_ICONS = ['👥', '💼', '🤝'];

const ACTIVITY: { icon: string; who: string; what: string; time: string; tag: string; tone: 'gold' | 'blue' | 'green' }[] = [
  { icon: '🏢', who: 'Marco R.',      what: 'joined from Milan',                time: '42s',  tag: 'New Member', tone: 'blue'  },
  { icon: '💰', who: 'DealRoom · RE', what: '€2.4M round just closed',          time: '3m',   tag: 'Funded',     tone: 'gold'  },
  { icon: '🤝', who: 'Sofia · Jo Corporate H.', what: 'introduced to Alco Ventures',      time: '6m',   tag: 'Intro',      tone: 'blue'  },
  { icon: '🚀', who: 'Green Capital', what: 'launched a new syndicate',         time: '11m',  tag: 'Live',       tone: 'green' },
  { icon: '📊', who: 'ASRA Holdings', what: 'shared Q3 healthcare thesis',      time: '17m',  tag: 'Insight',    tone: 'blue'  },
  { icon: '✍️',  who: 'Justyta K.',    what: 'signed the LOI on Olla Estate',  time: '22m',  tag: 'Signed',     tone: 'gold'  },
];

const FEATURES = [
  {
    title: 'Elite Business Community',
    desc: 'A merit-based circle of vetted operators, investors, and founders — no noise, no tire-kickers.',
  },
  {
    title: 'Direct Investment Access',
    desc: 'Exclusive allocation into high-potential ventures curated by the community and its partners.',
  },
  {
    title: 'The Deal Room',
    desc: 'Co-financing, syndication, and global business flows that turn insight into deployment.',
  },
];

const INDUSTRIES: { name: string; icon: string; image: string }[] = [
  {
    name: 'Petrol, Oil & Gas',
    icon: '🛢️',
    image: '/images/sectors/oil-&-gas.jpg',
  },
  {
    name: 'International Consulting',
    icon: '🌐',
    image: '/images/sectors/photo-1521737711867-e3b97375f902.avif',
  },
  {
    name: 'Healthcare, Science & Research',
    icon: '🧬',
    image: '/images/sectors/photo-1576091160399-112ba8d25d1d.avif',
  },
  {
    name: 'Trade & Finance',
    icon: '💹',
    image: '/images/sectors/photo-1611974789855-9c2a0a7236a3.avif',
  },
  {
    name: 'Real Estate',
    icon: '🏢',
    image: '/images/sectors/photo-1560518883-ce09059eeffa.avif',
  },
  {
    name: 'Building, Interior & Architecture',
    icon: '📐',
    image: '/images/sectors/photo-1487958449943-2429e8be8625.avif',
  },
  {
    name: 'Movie Production',
    icon: '🎬',
    image: '/images/sectors/photo-1478720568477-152d9b164e26.avif',
  },
  {
    name: 'Italian Fashion Consulting',
    icon: '👗',
    image: '/images/sectors/photo-1490481651871-ab68de25d43d.avif',
  },
  {
    name: 'Sports Academy',
    icon: '⚽',
    image: '/images/sectors/photo-1461896836934-ffe607ba8211.avif',
  },
  {
    name: 'Energy Division',
    icon: '⚡',
    image: '/images/sectors/photo-1509391366360-2e959784a276.avif',
  },
  {
    name: 'Innovation & Technology',
    icon: '💡',
    image: '/images/sectors/photo-1518770660439-4636190af475.avif',
  },
  {
    name: 'Academy & Training Courses',
    icon: '🎓',
    image: '/images/sectors/photo-1524178232363-1fb2b075b655.avif',
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Trillion Business Community (TBC)?',
    a: 'TBC is an exclusive global business network designed for entrepreneurs, investors, and C-level executives. It provides members with unparalleled opportunities to connect, collaborate, and grow across multiple industries — including finance, real estate, technology, insurance, and more. Members gain access to valuable business insights, premium partnerships, and exclusive deals.',
  },
  {
    q: 'Who can join TBC?',
    a: 'TBC is open to serious business professionals, investors, and entrepreneurs who are committed to growth and collaboration. Membership is designed for individuals and companies looking to expand their network, explore lucrative business opportunities, and gain insights from industry leaders.',
  },
  {
    q: 'What benefits do members receive?',
    a: 'Members of TBC enjoy direct access to global C-level professionals and investors, exclusive business deals and offers across multiple industries, networking opportunities with top entrepreneurs, business growth strategies and industry insights, and participation in events, webinars, and workshops hosted by TBC.',
  },
  {
    q: 'How can I earn or generate profit through TBC?',
    a: 'TBC allows members to leverage a network-based ecosystem where collaboration and referrals can generate income opportunities. Members can participate in partnerships, investment projects, and referral programs designed to reward engagement and business activity within the community.',
  },
  {
    q: 'Are there events or activities organized by TBC?',
    a: 'Yes. TBC regularly hosts networking events, webinars, workshops, and conferences that connect members with industry leaders and innovators. These activities are designed to facilitate knowledge sharing, business collaborations, and access to high-value deals across multiple sectors.',
  },
];

const PARTNERS: { name: string; src: string }[] = [
  { name: 'Benx',    src: '/images/partners/benx.png' },
  { name: 'EBN',     src: '/images/partners/ebn.png' },
  { name: 'BDM',     src: '/images/partners/bdm.png' },
  { name: 'Nat',     src: '/images/partners/nat.png' },
  
  { name: 'NWS',     src: '/images/partners/nws.png' },
  { name: 'ASRA',    src: '/images/partners/asra.png' },
  { name: 'Chef',    src: '/images/partners/chef.png' },
  { name: 'Alco',    src: '/images/partners/alco.png' },
  { name: 'Green',   src: '/images/partners/green.png' },
  { name: 'L1',      src: '/images/partners/l1.png' },
  { name: 'L2',      src: '/images/partners/l2.png' },
  { name: 'Justyta', src: '/images/partners/justyta.png' },
 
  { name: 'Scurri',  src: '/images/partners/scurri.png' },
  { name: 'Partner 18', src: '/images/partners/extra1.jpg' },
  { name: 'Partner 19', src: '/images/partners/extra2.png' },
  { name: 'Partner 20', src: '/images/partners/extra3.png' },
];

const STATS = [
  { value: 150, suffix: '+', label: 'Vetted Members' },
  { value: 34,  suffix: 'M+', label: 'Euro in Assets' },
  { value: 80,  suffix: '+',  label: 'Countries Reached' },
];

function useCountUp(target: number, active: boolean, duration = 1600) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return n;
}

function StatCard({ stat, active }: { stat: typeof STATS[number]; active: boolean }) {
  const n = useCountUp(stat.value, active);
  return (
    <div className="lp-stat">
      <div className="lp-stat-value">
        <span>{n}</span>
        <span className="lp-stat-suffix">{stat.suffix}</span>
      </div>
      <div className="lp-stat-label">{stat.label}</div>
    </div>
  );
}

export default function LandingPage() {
  const [statsActive, setStatsActive] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activityIdx, setActivityIdx] = useState(0);
  const [capital, setCapital] = useState(34_284_500);
  const statsRef = useRef<HTMLDivElement | null>(null);

  // Cycle the activity feed
  useEffect(() => {
    const id = setInterval(() => setActivityIdx((i) => (i + 1) % ACTIVITY.length), 3200);
    return () => clearInterval(id);
  }, []);

  // Live capital ticker
  useEffect(() => {
    const id = setInterval(() => setCapital((c) => c + Math.floor(Math.random() * 4200) + 400), 1400);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('lp-visible');
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll('.lp-reveal').forEach((el) => observer.observe(el));

    const statsObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setStatsActive(true)),
      { threshold: 0.35 },
    );
    if (statsRef.current) statsObs.observe(statsRef.current);

    return () => {
      observer.disconnect();
      statsObs.disconnect();
    };
  }, []);

  return (
    <div className="lp-root">
      {/* Ambient background layers */}
      <div className="lp-aurora">
        <span className="lp-blob lp-blob-1" />
        <span className="lp-blob lp-blob-2" />
        <span className="lp-blob lp-blob-3" />
        <span className="lp-blob lp-blob-4" />
      </div>
      <div className="lp-grid" />
      <div className="lp-noise" />
      <div className="lp-particles" aria-hidden>
        {Array.from({ length: 22 }).map((_, i) => (
          <span key={i} className="lp-particle" style={{ '--i': i } as any} />
        ))}
      </div>

      {/* ── Nav ─────────────────────────── */}
      <header className="lp-nav">
        <Link href="/" className="lp-nav-brand">
          <span className="lp-brand-mark">
            <img src="/images/tbc-logo-1.png" alt="TBC" />
          </span>
          <span className="lp-brand-text">
            <span className="lp-brand-name">TRILLION</span>
            <span className="lp-brand-sub">BUSINESS COMMUNITY</span>
          </span>
        </Link>

        <nav className="lp-nav-links">
          <a href="#pillars">Pillars</a>
          <a href="#features">Ecosystem</a>
          <a href="#philosophy">Philosophy</a>
          <a href="#industries">Industries</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div className="lp-nav-cta">
          <Link href="/login" className="lp-btn lp-btn-ghost">Log In</Link>
          <Link href="/register" className="lp-btn lp-btn-primary">
            <span>Sign Up</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-copy lp-reveal">
          <div className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            Where vision becomes measurable impact.
          </div>
          <h1 className="lp-hero-title">
           The World's Most Exclusive <span className="lp-hero-accent">Business Community</span>
          </h1>
      
          <p className="lp-hero-desc">
            A private ecosystem connecting real operators, investors, and innovators — combining
            community DealRooms, capital management, and global opportunity into one high-signal circle.
          </p>

          <div className="lp-hero-actions">
            <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
              <span>Get Started</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Link>
            <a href="#pillars" className="lp-btn lp-btn-outline lp-btn-lg">How It Works</a>
          </div>

          <div className="lp-hero-trust">
            <div className="lp-avatar-stack">
              <span className="lp-avatar lp-a1">V</span>
              <span className="lp-avatar lp-a2">M</span>
              <span className="lp-avatar lp-a3">R</span>
              <span className="lp-avatar lp-a4">+</span>
            </div>
            <div>
              <div className="lp-trust-num">150+ operators</div>
              <div className="lp-trust-sub">across 80+ countries · vetted quarterly</div>
            </div>
          </div>
        </div>

        {/* Orbital visual */}
        <div className="lp-hero-visual lp-reveal">
          <div className="lp-orbits">
            <div className="lp-ring lp-ring-1" />
            <div className="lp-ring lp-ring-2" />
            <div className="lp-ring lp-ring-3" />
            <div className="lp-ring lp-ring-4" />

            <div className="lp-orb-center">
              <div className="lp-orb-num">150+</div>
              <div className="lp-orb-label">Members</div>
            </div>

            {/* Orbiting nodes */}
            <div className="lp-orbiter lp-orbiter-1"><span className="lp-node lp-node-emoji">🌍</span></div>
            <div className="lp-orbiter lp-orbiter-2"><span className="lp-node lp-node-gold lp-node-emoji">💰</span></div>
            <div className="lp-orbiter lp-orbiter-3"><span className="lp-node lp-node-emoji">🤖</span></div>
            <div className="lp-orbiter lp-orbiter-4"><span className="lp-node lp-node-blue lp-node-emoji">🏢</span></div>
            <div className="lp-orbiter lp-orbiter-5"><span className="lp-node lp-node-emoji">🏥</span></div>
            <div className="lp-orbiter lp-orbiter-6"><span className="lp-node lp-node-gold lp-node-emoji">📊</span></div>
          </div>

          {/* Live capital ticker */}
          <div className="lp-live-ticker">
            <div className="lp-live-ticker-label">
              <span className="lp-live-pulse" />
              Capital Deployed · Today
            </div>
            <div className="lp-live-ticker-value">
              €{capital.toLocaleString('en-US')}
              <span className="lp-live-ticker-arrow">↑</span>
            </div>
          </div>

          {/* Live activity console */}
          <div className="lp-console">
            <div className="lp-console-head">
              <span className="lp-live-pulse" />
              <span className="lp-console-title">Network Activity</span>
              <span className="lp-console-live">LIVE</span>
            </div>
            <div className="lp-console-feed">
              {ACTIVITY.map((a, i) => (
                <div
                  key={i}
                  className={`lp-activity ${i === activityIdx ? 'lp-activity-active' : ''}`}
                  aria-hidden={i !== activityIdx}
                >
                  <span className={`lp-activity-icon lp-activity-${a.tone}`}>{a.icon}</span>
                  <div className="lp-activity-body">
                    <div className="lp-activity-text">
                      <strong>{a.who}</strong> {a.what}
                    </div>
                    <div className="lp-activity-meta">
                      <span className={`lp-activity-tag lp-activity-${a.tone}-tag`}>{a.tag}</span>
                      <span className="lp-activity-time">{a.time} ago</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Mini bars pulsing to look like real-time signal */}
            <div className="lp-console-bars">
              {Array.from({ length: 22 }).map((_, i) => (
                <span key={i} className="lp-console-bar" style={{ animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Industry marquee ────────────── */}
      <section className="lp-marquee-wrap">
        <div className="lp-marquee">
          <div className="lp-marquee-track">
            {[...INDUSTRIES, ...INDUSTRIES].map((t, i) => (
              <span key={i} className="lp-marquee-item">
                <span className="lp-marquee-emoji">{t.icon}</span>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Three Pillars ───────────────── */}
      <section id="pillars" className="lp-section">
        <div className="lp-section-head lp-reveal">
          <div className="lp-tag">The Foundation</div>
          <h2 className="lp-section-title">Three pillars. One outcome.</h2>
          <p className="lp-section-sub">
            TBC is built on a philosophy that turns individual strength into multiplied value.
          </p>
        </div>

        <div className="lp-pillars">
          {PILLARS.map((p, i) => (
            <article key={p.key} className="lp-pillar lp-reveal" style={{ transitionDelay: `${i * 90}ms` }}>
              <div className="lp-pillar-icon">{p.icon}</div>
              <h3 className="lp-pillar-title">{p.title}</h3>
              <p className="lp-pillar-body">{p.body}</p>
              <div className="lp-pillar-glow" />
            </article>
          ))}
        </div>
      </section>

      {/* ── Stats ───────────────────────── */}
      <section className="lp-section lp-stats-section" ref={statsRef}>
        <div className="lp-stats lp-reveal">
          {STATS.map((s) => (
            <StatCard key={s.label} stat={s} active={statsActive} />
          ))}
        </div>
      </section>

      {/* ── Trusted Partners ────────────── */}
      <section id="partners" className="lp-section lp-partners-section">
        <div className="lp-section-head lp-reveal">
          <div className="lp-tag">Trusted By</div>
          <h2 className="lp-section-title">Brands and partners in the community.</h2>
          <p className="lp-section-sub">
            Operators and companies collaborating inside TBC — a fraction of the network.
          </p>
        </div>

        <div className="lp-partners lp-reveal">
          <div className="lp-partners-fade lp-partners-fade-l" />
          <div className="lp-partners-fade lp-partners-fade-r" />
          <div className="lp-partners-track">
            {[...PARTNERS, ...PARTNERS].map((p, i) => (
              <div key={i} className="lp-partner" title={p.name}>
                <img src={p.src} alt={p.name} loading="lazy" />
              </div>
            ))}
          </div>
        </div>

        <div className="lp-partners lp-reveal">
          <div className="lp-partners-fade lp-partners-fade-l" />
          <div className="lp-partners-fade lp-partners-fade-r" />
          <div className="lp-partners-track lp-partners-track-reverse">
            {[...PARTNERS].reverse().concat([...PARTNERS].reverse()).map((p, i) => (
              <div key={i} className="lp-partner lp-partner-alt" title={p.name}>
                <img src={p.src} alt={p.name} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features / Ecosystem ────────── */}
      <section id="features" className="lp-section">
        <div className="lp-section-head lp-reveal">
          <div className="lp-tag">The Ecosystem</div>
          <h2 className="lp-section-title">Built for operators who don't wait.</h2>
          <p className="lp-section-sub">
            Community, capital, and deal flow — all in one connected surface.
          </p>
        </div>

        <div className="lp-features">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="lp-feature lp-reveal" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="lp-feature-icon">{FEATURE_ICONS[i]}</div>
              <div className="lp-feature-index">0{i + 1}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
              <div className="lp-feature-arrow">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Floating Coin ───────────────── */}
      <section className="lp-coin-showcase lp-reveal" aria-hidden>
        <div className="lp-coin-halo" />
        <img
          src="/images/coin-front.png"
          alt="TBC Coin"
          className="lp-coin-image"
        />
        <div className="lp-coin-shadow" />
      </section>

      {/* ── Mission / Vision split ──────── */}
      <section id="mission" className="lp-section lp-mission">
        <div className="lp-mission-grid">
          <div className="lp-mission-card lp-reveal">
            <div className="lp-tag lp-tag-alt">Mission</div>
            <h3 className="lp-mission-title">
              Connection. Innovation. Shared growth.
            </h3>
            <ul className="lp-mission-list">
              <li>
                <span className="lp-check">→</span>
                <div>
                  <strong>Connection</strong> — authentic, productive relationships between
                  entrepreneurs, investors, and institutions.
                </div>
              </li>
              <li>
                <span className="lp-check">→</span>
                <div>
                  <strong>Innovation</strong> — supporting projects that integrate technology,
                  sustainability, and human value.
                </div>
              </li>
              <li>
                <span className="lp-check">→</span>
                <div>
                  <strong>Shared growth</strong> — profit-sharing systems that reward active
                  participation and contribution.
                </div>
              </li>
            </ul>
          </div>

          <div className="lp-mission-vision lp-reveal">
            <div className="lp-tag lp-tag-alt">Vision</div>
            <p className="lp-quote">
              "When individual strengths come together, value multiplies. TBC is more than a
              network — it's a shared-value ecosystem where expertise, collaboration, and vision
              converge into measurable impact."
            </p>
            <div className="lp-vision-orbs">
              <div className="lp-vision-orb" />
              <div className="lp-vision-orb lp-vision-orb-2" />
              <div className="lp-vision-orb lp-vision-orb-3" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Guiding Philosophy ──────────── */}
      <section id="philosophy" className="lp-section lp-philosophy">
        <div className="lp-philosophy-glow" />
        <div className="lp-section-head lp-reveal">
          <div className="lp-tag lp-tag-alt">Our Philosophy</div>
          <h2 className="lp-section-title">
            Our guiding philosophy <br />
            <span className="lp-hero-accent">behind every action.</span>
          </h2>
        </div>

        <div className="lp-philosophy-lead lp-reveal">
          <p>
            Trillion Business Community was created around a simple yet powerful principle —
            <em> when individual strengths come together, value multiplies.</em>
          </p>
        </div>

        <div className="lp-philosophy-body lp-reveal">
          <p>
            Within TBC, every relationship generates the momentum to transform opportunities;
            every idea can become actionable; and every vision can take shape when supported by
            a solid, informed, and trusted network. TBC has shaped its identity as a space
            where connection, trust, and creation are not concepts — but catalysts for tangible
            transformation.
          </p>
          <p>
            An ecosystem that unites minds, capital, and opportunities. TBC is more than a
            network of contacts — it is a shared-value ecosystem where expertise, collaboration,
            and vision converge with a single purpose: generating meaningful, measurable impact.
            Each member contributes to a virtuous cycle in which individual experience evolves
            into collective strength.
          </p>
        </div>

        <div className="lp-catalysts lp-reveal">
          <div className="lp-catalyst">
            <span className="lp-catalyst-icon">🔗</span>
            <div>
              <div className="lp-catalyst-title">Connection</div>
              <div className="lp-catalyst-sub">Relationships that move the needle</div>
            </div>
          </div>
          <div className="lp-catalyst-divider" />
          <div className="lp-catalyst">
            <span className="lp-catalyst-icon">🛡️</span>
            <div>
              <div className="lp-catalyst-title">Trust</div>
              <div className="lp-catalyst-sub">Vetted, verified, accountable</div>
            </div>
          </div>
          <div className="lp-catalyst-divider" />
          <div className="lp-catalyst">
            <span className="lp-catalyst-icon">✨</span>
            <div>
              <div className="lp-catalyst-title">Creation</div>
              <div className="lp-catalyst-sub">Where ideas become deployable</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Industries ──────────────────── */}
      <section id="industries" className="lp-section">
        <div className="lp-section-head lp-reveal">
          <div className="lp-tag">Where We Play</div>
          <h2 className="lp-section-title">Sector focus, global reach.</h2>
          <p className="lp-section-sub">
            Cross-industry expertise — because the best deals rarely stay in one lane.
          </p>
        </div>

        <div className="lp-industries">
          {INDUSTRIES.map((ind, i) => (
            <div key={ind.name} className="lp-industry lp-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
              <div className="lp-industry-media">
                <img
                  src={ind.image}
                  alt={ind.name}
                  className="lp-industry-image"
                  loading="lazy"
                />
                <div className="lp-industry-overlay" />
              </div>
              <div className="lp-industry-content">
                <span className="lp-industry-badge">{ind.icon}</span>
                <span className="lp-industry-name">{ind.name}</span>
              </div>
              <span className="lp-industry-line" />
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────── */}
      <section id="faq" className="lp-section lp-faq-section">
        <div className="lp-faq-grid">
          <div className="lp-faq-intro lp-reveal">
            <div className="lp-tag">FAQ</div>
            <h2 className="lp-section-title" style={{ textAlign: 'left', marginTop: 16 }}>
              Answers, before you ask.
            </h2>
            <p className="lp-section-sub" style={{ textAlign: 'left', margin: '14px 0 24px' }}>
              Everything you need to know about joining, participating in, and earning through TBC.
            </p>
            <Link href="/register" className="lp-btn lp-btn-outline">
              Still curious? Apply →
            </Link>
          </div>

          <div className="lp-faq-list">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className={`lp-faq lp-reveal ${open ? 'lp-faq-open' : ''}`} style={{ transitionDelay: `${i * 60}ms` }}>
                  <button
                    className="lp-faq-head"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                  >
                    <span className="lp-faq-num">0{i + 1}</span>
                    <span className="lp-faq-q">{faq.q}</span>
                    <span className="lp-faq-icon" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                    </span>
                  </button>
                  <div className="lp-faq-body">
                    <div className="lp-faq-body-inner">
                      <p>{faq.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────── */}
      <section className="lp-cta-section">
        <div className="lp-cta-inner lp-reveal">
          <div className="lp-cta-glow" />
          <div className="lp-tag">Membership by Application</div>
          <h2 className="lp-cta-title">Step inside the community.</h2>
          <p className="lp-cta-sub">
            Applications are reviewed on merit — operators, investors, and founders welcome.
          </p>
          <div className="lp-cta-actions">
            <Link href="/register" className="lp-btn lp-btn-primary lp-btn-lg">
              <span>Apply Now</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </Link>
            <Link href="/login" className="lp-btn lp-btn-outline lp-btn-lg">I'm a Member</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div className="lp-footer-col lp-footer-col-brand">
            <div className="lp-footer-brand">
              <img src="/images/tbc-logo-1.png" alt="TBC" />
              <div>
                <div className="lp-brand-name">TRILLION BUSINESS COMMUNITY</div>
                <div className="lp-footer-tag">Advantage · Opportunity · Profit</div>
              </div>
            </div>
            <p className="lp-footer-desc">
              A global community designed to connect entrepreneurs, investors, innovators,
              and professionals under one unified circle.
            </p>
            <div className="lp-socials">
              <a href="#" aria-label="Facebook" className="lp-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.5v1.8h2.6l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z"/></svg>
              </a>
              <a href="#" aria-label="LinkedIn" className="lp-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5v-9h3v9zM6.5 8.3a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5zM19 19h-3v-4.7c0-1.1-.4-1.9-1.4-1.9-.8 0-1.3.5-1.5 1-.1.2-.1.5-.1.7V19h-3s0-8.2 0-9h3v1.3c.4-.6 1.1-1.5 2.7-1.5 2 0 3.3 1.3 3.3 4V19z"/></svg>
              </a>
              <a href="#" aria-label="Instagram" className="lp-social">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
              </a>
            </div>
          </div>

          <div className="lp-footer-col">
            <div className="lp-footer-heading">Quick Links</div>
            <ul className="lp-footer-links">
              <li><a href="#">Home</a></li>
              <li><a href="#philosophy">About Us</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><a href="#partners">Partners</a></li>
            </ul>
          </div>

          <div className="lp-footer-col">
            <div className="lp-footer-heading">Community</div>
            <ul className="lp-footer-links">
              <li><Link href="/register">Apply for Membership</Link></li>
              <li><Link href="/login">Member Login</Link></li>
              <li><a href="#features">The Ecosystem</a></li>
              <li><a href="#industries">Sectors</a></li>
            </ul>
          </div>

          <div className="lp-footer-col">
            <div className="lp-footer-heading">Contact</div>
            <ul className="lp-footer-links">
              <li><a href="mailto:hello@trillionbc.com">hello@trillionbc.com</a></li>
              <li><a href="#">Contact Us</a></li>
            </ul>
          </div>
        </div>

        <div className="lp-footer-bottom">
          © {new Date().getFullYear()} All rights reserved · Trillion Business Community
        </div>
      </footer>
    </div>
  );
}
