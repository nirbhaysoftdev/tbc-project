// src/lib/landing-data.ts
// Single source of content for the public landing experience.
// Keeping it out of the components lets copy be edited without touching markup.

/* ── 02 · WHAT IS IT ─────────────────────────────── */

export const WHAT_IT_IS = {
  tag: 'What it is',
  title: 'A private community for business owners.',
  lead:
    'Trillion Business Community brings together owners, operators and investors from a dozen different industries - and puts them in one room.',
  body:
    'Every member arrives with something another member needs: a project, a service, a skill, capital, a market, an idea. On your own, those matches are almost impossible to find. Inside the community, they are the point.',
  marks: [
    { k: 'Members', v: 'Business owners, operators, investors' },
    { k: 'Industries', v: '12 sectors, from construction to fashion' },
    { k: 'Reach', v: '80+ countries' },
    { k: 'Entry', v: 'By application, reviewed on merit' },
  ],
};

/* ── 02B · ADVANTAGES ────────────────────────────── */
/* Institutional privileges members reach through community partners -
   ported from the reference design given for this section. Bank names,
   perks and partner copy are the exact content supplied; nothing here is
   invented beyond what was asked. Real logo assets already in the repo
   (Zurich, Barceló, Kalaani, IVF) are wired in; partners the repo has no
   asset for render as a plain monogram tile instead of a fabricated mark.
   The full country list is illustrative, supporting the "80+ countries"
   stat already used elsewhere (WHAT_IT_IS.marks, STATS). */

export type AdvBrand = { key: string; name: string; sub: string; mono?: string; logo?: string; wide?: true };
export type AdvCard = {
  key: string;
  cat: 'banking' | 'insurance-law' | 'mobility-lifestyle' | 'media-medical';
  icon: 'bank' | 'shield' | 'legal' | 'jet' | 'hotel' | 'estate' | 'medical' | 'media';
  title: string;
  subtitle: string;
  badge: string;
  desc?: string;
  brands?: AdvBrand[];
  footLeft: string;
  footRight: string;
};

export const ADVANTAGES = {
  tag: 'Institutional advantages & global vetting',
  title: 'Global footprint.',
  titleAccent: 'Unrivaled institutional access.',
  sub: 'Direct sovereignty for community members. Instant priority allocation across tier-1 international banks, Zurich insurance structures, private aviation fleets, luxury hospitality and sovereign fiscal law.',
  hubs: [
    { key: 'dubai', flag: '🇦🇪', label: 'Dubai / UAE', tag: 'HQ' },
    { key: 'eu', flag: '🇪🇺', label: 'All EU countries' },
    { key: 'italy', flag: '🇮🇹', label: 'Italy' },
    { key: 'singapore', flag: '🇸🇬', label: 'Singapore' },
    { key: 'china', flag: '🇨🇳', label: 'China' },
    { key: 'indonesia', flag: '🇮🇩', label: 'Indonesia' },
    { key: 'russia', flag: '🇷🇺', label: 'Russia' },
    { key: 'kenya', flag: '🇰🇪', label: 'Kenya' },
  ],
  categories: [
    { key: 'banking', label: 'Capital & Banking' },
    { key: 'insurance-law', label: 'Insurance & Fiscal Law' },
    { key: 'mobility-lifestyle', label: 'Mobility & Living' },
    { key: 'media-medical', label: 'Health & Media' },
  ] as { key: AdvCard['cat']; label: string }[],
  cards: [
    {
      key: 'banking',
      cat: 'banking',
      icon: 'bank',
      title: 'We Trust these Banks',
      subtitle: 'Institutional onboarding & escrow',
      badge: '5 institutions',
      brands: [
        { key: 'enbd', name: 'Emirates NBD', sub: 'Corporate & private', mono: 'ENBD', logo: '/images/partners/bank-nbd.png', },
        { key: 'mashreq', name: 'Mashreq', sub: 'NEO & treasury', mono: 'M', logo: '/images/partners/bank-mashreq.png' },
        { key: 'wio', name: 'Wio Bank', sub: 'Digital commercial', mono: 'W', logo: '/images/partners/bank-wio.png' },
        { key: 'fab', name: 'FAB', sub: 'First Abu Dhabi', mono: 'FAB', logo: '/images/partners/bank-fab.png' },
        { key: 'sib', name: 'Sharjah Islamic Bank (SIB)', sub: 'Sharia-compliant desk', mono: 'SIB', wide: true, logo: '/images/partners/bank-sib.png' },
      ],
      footLeft: '',
      footRight: 'Privileges included',
    },
    {
      key: 'zurich',
      cat: 'insurance-law',
      icon: 'shield',
      title: 'Wealth & Risk Underwriting',
      subtitle: 'Institutional global cover',
      badge: 'A+ rated',
      desc: 'Enterprise risk mitigation, cross-border key-person policies, and generational wealth succession umbrella.',
      brands: [
        { key: 'zurich', name: 'Zurich Insurance', sub: 'Comprehensive life & corporate policies', logo: '/images/partners/zurich.png' },
      ],
      footLeft: 'Priority risk desk',
      footRight: 'Underwriting terms',
    },
    {
      key: 'legal-fiscal',
      cat: 'insurance-law',
      icon: 'legal',
      title: 'Fiscal Advisory & Law Firms',
      subtitle: 'Cross-border tax & legal shield',
      badge: 'EU · GCC · Asia',
      desc: 'Elite international legal chambers specialising in holding structures, double-taxation treaties, and residency corridors.',
      brands: [
        { key: 'legal', name: 'International Legal Chambers', sub: 'Corporate governance & mergers', wide: true, logo: '/images/partners/justyta.png' },
        // { key: 'fiscal', name: 'Sovereign Fiscal Consultancies', sub: 'Zero-friction tax structuring', wide: true, logo: '/images/brands/cnca.webp' },
      ],
      footLeft: 'Retainer consultation',
      footRight: 'Confidential review',
    },
    {
      key: 'tga',
      cat: 'mobility-lifestyle',
      icon: 'jet',
      title: 'Private Jet Charters',
      subtitle: 'Direct runway clearance',
      badge: '2hr mobilization',
      desc: 'Guaranteed charter availability with empty-leg allocations across Dubai, European capitals, and Asia-Pacific.',
      brands: [
        { key: 'tga', name: 'TGA', sub: 'Private jet aviation', logo: '/images/partners/tga.png', mono: 'TGA' },
      ],
      footLeft: 'Fleet: Global 7500 / Challenger',
      footRight: 'Request flight',
    },
    {
      key: 'barcelo',
      cat: 'mobility-lifestyle',
      icon: 'hotel',
      title: 'Hospitality & Residences',
      subtitle: 'VIP upgrade concierge',
      badge: 'Global keys',
      desc: 'Permanent reserved suite availability, discreet private check-in, and dining access for members and delegates.',
      brands: [
        { key: 'barcelo', name: 'Barceló', sub: 'Hotel group', logo: '/images/partners/webp/barcelo.png' },
      ],
      footLeft: 'Complimentary presidential upgrades',
      footRight: 'View portfolio',
    },
    {
      key: 'kalaani',
      cat: 'mobility-lifestyle',
      icon: 'estate',
      title: 'Ultra-Prime Real Estate',
      subtitle: 'Off-market asset acquisitions',
      badge: 'Trophy deals',
      desc: 'Confidential acquisition of freehold commercial towers, prime residential compounds, and waterfront sanctuaries.',
      brands: [
        { key: 'kalaani', name: 'Kalaani', sub: 'Real estate partners', logo: '/images/brands/kalaani-realtors.png' },
      ],
      footLeft: 'Private deal room',
      footRight: 'Access listings',
    },
        {
      key: 'Charity',
      cat: 'mobility-lifestyle',
      icon: 'estate',
      title: 'Charity Foundation',
      subtitle: 'charity for childrens & family',
      badge: 'Charity Foundation',
      desc: 'Confidential acquisition of freehold commercial towers, prime residential compounds, and waterfront sanctuaries.',
      brands: [
        { key: 'Eben-ezer', name: 'Eben Ezer', sub: 'Non-profit organization', logo: '/images/partners/webp/eben-exer.png' },
      ],
      footLeft: 'Private deal room',
      footRight: 'Access listings',
    },
   
    // {
    //   key: 'media',
    //   cat: 'media-medical',
    //   icon: 'media',
    //   title: 'Media Production & Events',
    //   subtitle: 'Institutional influence',
    //   badge: 'Broadcast tier',
    //   desc: 'High-caliber documentary film production, international investor summit curation, and tier-1 press distribution.',
    //   brands: [
    //     { key: 'media', name: 'Global Event & Media Hub', sub: 'Broadcast curation & production', mono: 'GM', logo: '/images/brands/chef-arena.png' },
    //   ],
    //   footLeft: 'Stage & keynote allocation',
    //   footRight: 'Production desk',
    // },
  ] as AdvCard[],
};

export const ADVANTAGE_COUNTRIES = [
  'United States', 'Canada', 'Mexico', 'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru',
  'United Kingdom', 'Ireland', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands',
  'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland',
  'Czech Republic', 'Greece', 'Russia', 'Ukraine', 'Turkey', 'UAE', 'Saudi Arabia', 'Qatar',
  'Kuwait', 'Bahrain', 'Oman', 'Israel', 'Jordan', 'Egypt', 'Morocco', 'Tunisia',
  'Kenya', 'Nigeria', 'South Africa', 'Ghana', 'Ethiopia', 'India', 'Pakistan', 'Bangladesh',
  'Sri Lanka', 'China', 'Hong Kong', 'Japan', 'South Korea', 'Singapore', 'Malaysia', 'Indonesia',
  'Thailand', 'Vietnam', 'Philippines', 'Taiwan', 'Australia', 'New Zealand', 'Iceland', 'Luxembourg',
  'Monaco', 'Cyprus', 'Malta', 'Croatia', 'Romania', 'Hungary', 'Slovakia', 'Slovenia',
  'Bulgaria', 'Serbia', 'Georgia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan', 'Lebanon', 'Iraq',
  'Algeria', 'Senegal', 'Tanzania', 'Uganda', 'Zambia', 'Botswana',
];

/* ── 03 · WHY JOIN ───────────────────────────────── */
/* Concrete outcomes, not "build relationships". Each card answers: how does
   this help my business specifically?

   The nine outcomes are grouped into three tracks, because read as a flat
   wall of nine they all weigh the same and none of them lands. Each track
   opens with a rail - index, label, one line - and then one lead card that
   carries the commercial argument plus two supporting cards. `tag` is the
   scannable payoff, so the section can be read by chips alone. */

export type ValueCard = {
  key: string;
  icon: string;
  /** Two- or three-word payoff, shown as a chip above the title. */
  tag: string;
  title: string;
  body: string;
  /** Tightened line used in the supporting cells. */
  short?: string;
  /** One per track: the lead card, drawn wide with full-size art. */
  featured?: true;
  /** Which isometric scene to draw. */
  iso:
    | 'early'
    | 'direct'
    | 'inbound'
    | 'partner'
    | 'supply'
    | 'expertise'
    | 'intro'
    | 'idea'
    | 'market';
};

export const WHY_JOIN: ValueCard[] = [
  {
    key: 'opportunities',
    iso: 'early',
    icon: '◈',
    tag: 'Earlier information',
    title: 'Hear about work before it is public',
    body:
      'Projects, tenders and expansion plans get discussed between members while they are still being shaped - not after they have gone to the open market.',
    short: 'Discussed while still being shaped.',
    featured: true,
  },
  {
    key: 'intros',
    iso: 'intro',
    icon: '⬖',
    tag: 'Warm access',
    title: 'Get introduced, not cold-emailed',
    body:
      'A warm introduction from inside the community opens doors that a cold approach to the same company would not.',
    short: 'Doors a cold approach would not open.',
  },
  {
    key: 'capital',
    iso: 'direct',
    icon: '◆',
    tag: 'Direct capital',
    title: 'Sit across from capital, directly',
    body:
      'Members who invest are in the same community as members who build. Conversations start without an intermediary deciding whether they happen.',
    short: 'No intermediary deciding if it happens.',
  },
  {
    key: 'partners',
    iso: 'partner',
    icon: '⬗',
    tag: 'Bigger mandates',
    title: 'Find the partner a deal is missing',
    body:
      'A project you cannot take alone becomes one you can, once you know the member who covers the half you do not.',
    short: 'The half of the deal you cannot cover, covered.',
    featured: true,
  },
  {
    key: 'suppliers',
    iso: 'supply',
    icon: '⬢',
    tag: 'Vouched supply',
    title: 'Source suppliers you can vouch for',
    body:
      'Materials, logistics, legal, technical, creative - sourced from members another member has already worked with and will answer for.',
    short: 'Vouched for by a member who has used them.',
  },
  {
    key: 'expertise',
    iso: 'expertise',
    icon: '◇',
    tag: 'Borrowed know-how',
    title: 'Borrow expertise you do not employ',
    body:
      'Entering a new market, a new regulation, a new category - ask the member who has already done it instead of paying to learn it twice.',
    short: 'Ask the member who has already done it.',
  },
  {
    key: 'referrals',
    iso: 'inbound',
    icon: '⬟',
    tag: 'Inbound that compounds',
    title: 'Become the member others send work to',
    body:
      'Referrals move in both directions. The members who contribute most are the ones the community thinks of first - and that compounds.',
    short: 'The community thinks of you first.',
    featured: true,
  },
  {
    key: 'markets',
    iso: 'market',
    icon: '⬣',
    tag: 'Faster entry',
    title: 'Enter a market with someone already in it',
    body:
      'Expanding into a new country or sector is faster alongside a member who operates there than it is alone.',
    short: 'Faster alongside a member already there.',
  },
  {
    key: 'ideas',
    iso: 'idea',
    icon: '✦',
    tag: 'New ventures',
    title: 'Leave with ideas you have not started',
    body:
      'Seeing what other industries need is where new products, services and ventures come from. Most start as a remark in a conversation.',
    short: 'New ventures start as a remark.',
  },
];

/* The three tracks, in reading order. `cards` are ValueCard keys; the first
   one in each track is the featured lead. */

export type ValueTrack = {
  key: string;
  n: string;
  label: string;
  line: string;
  /** Photo for the track rail - reuses the sector thumbnails, which are
      already sized and compressed for the page. */
  image: string;
  alt: string;
  cards: string[];
};

export const WHY_TRACKS: ValueTrack[] = [
  {
    key: 'flow',
    n: '01',
    label: 'Deal flow',
    line: 'Work, capital and introductions reach you earlier than they reach the market.',
    image: '/images/sectors/thumb/finance.webp',
    alt: 'Members reviewing a deal around a boardroom table',
    cards: ['opportunities', 'intros', 'capital'],
  },
  {
    key: 'capability',
    n: '02',
    label: 'Capability',
    line: 'Take on what you could not take alone - partners, supply and expertise on call.',
    image: '/images/sectors/thumb/consulting.webp',
    alt: 'Two member businesses working a project together',
    cards: ['partners', 'suppliers', 'expertise'],
  },
  {
    key: 'compounding',
    n: '03',
    label: 'Compounding',
    line: 'Standing you build once keeps returning work, markets and ideas afterwards.',
    image: '/images/sectors/thumb/academy-traning.webp',
    alt: 'A full room of members at a community session',
    cards: ['referrals', 'markets', 'ideas'],
  },
];

/** The cards of one track, lead first. */
export const trackCards = (track: ValueTrack): ValueCard[] =>
  track.cards
    .map((k) => WHY_JOIN.find((c) => c.key === k))
    .filter((c): c is ValueCard => Boolean(c));

/* ── 04 · HOW IT WORKS ───────────────────────────── */

export type FlowStep = {
  key: string;
  n: string;
  title: string;
  line: string;
  body: string;
  /** Labels that animate in around the step. */
  chips: string[];
};

export const FLOW: FlowStep[] = [
  {
    key: 'discover',
    n: '01',
    title: 'Discover',
    line: 'Something surfaces.',
    body:
      'A member brings an opportunity, a requirement, a challenge or an idea into the community - a project starting, a gap in a supply chain, a market opening up.',
    chips: ['A new project', 'A requirement', 'An idea', 'A challenge'],
  },
  {
    key: 'connect',
    n: '02',
    title: 'Connect',
    line: 'The right members step forward.',
    body:
      'Instead of searching the open market, the member finds the people inside the community whose business, expertise or capital is relevant to it.',
    chips: ['Relevant industries', 'Proven members', 'Warm introductions'],
  },
  {
    key: 'collaborate',
    n: '03',
    title: 'Collaborate',
    line: 'Each brings a different piece.',
    body:
      'One member has the expertise. One has the service. One has the capital. One has the market. One has done it before. Separately, none of them is enough.',
    chips: ['Expertise', 'Services', 'Capital', 'Resources', 'Experience'],
  },
  {
    key: 'create',
    n: '04',
    title: 'Create',
    line: 'Something real takes shape.',
    body:
      'A partnership, a joint project, a new service, a new product, a new company - built out of parts that already existed in the room.',
    chips: ['A partnership', 'A project', 'A new venture', 'A new product'],
  },
  {
    key: 'grow',
    n: '05',
    title: 'Grow',
    line: 'Every business involved is bigger.',
    body:
      'The result is not one winner. Each member who contributed carries revenue, a reference and a relationship back into their own business.',
    chips: ['Revenue', 'References', 'Relationships', 'New capability'],
  },
];

/* ── 05 · REAL SCENARIO ──────────────────────────── */
/* A worked example, built as a structure that assembles from the
   foundation up - one layer per member business. Order is bottom-up:
   index 0 is the foundation, the last entry is the top. */

export type ScenarioLayer = {
  key: string;
  /** What this contribution is, as a material layer. */
  layer: string;
  role: string;
  icon: string;
  brings: string;
  gains: string;
  /** Surface treatment, so the stack reads as different materials. */
  fill: 'solid' | 'hatch' | 'grain' | 'grid' | 'light';
};

export const SCENARIO = {
  tag: 'A worked example',
  title: 'One opportunity. Six businesses.',
  sub:
    'A single construction project enters the community. Every member who sees it adds the part they already have.',
  opportunity: 'A construction project',
  opportunityIcon: '▦',
  layers: [
    {
      key: 'investor',
      layer: 'Capital',
      role: 'Investor',
      icon: '◆',
      brings: 'Provides the capital',
      gains: 'Takes a position early',
      fill: 'solid',
    },
    {
      key: 'consultant',
      layer: 'Expertise',
      role: 'Consultant',
      icon: '◇',
      brings: 'Specialist expertise',
      gains: 'Builds a long engagement',
      fill: 'hatch',
    },
    {
      key: 'supplier',
      layer: 'Materials',
      role: 'Supplier',
      icon: '⬢',
      brings: 'Materials and logistics',
      gains: 'Secures a long order book',
      fill: 'grain',
    },
    {
      key: 'builder',
      layer: 'Structure',
      role: 'Construction company',
      icon: '▦',
      brings: 'Executes the build',
      gains: 'Wins the contract',
      fill: 'solid',
    },
    {
      key: 'tech',
      layer: 'Systems',
      role: 'Technology company',
      icon: '◉',
      brings: 'Software and systems',
      gains: 'Lands a reference client',
      fill: 'grid',
    },
    {
      key: 'marketing',
      layer: 'Brand',
      role: 'Marketing company',
      icon: '✦',
      brings: 'Branding and launch',
      gains: 'Adds a flagship account',
      fill: 'light',
    },
  ] as ScenarioLayer[],
  outcome: 'Funded, built, and launched',
  closing: 'One member brought it in. Six businesses got paid.',
};

/* ── 06 · INDUSTRIES ─────────────────────────────── */
/* The twelve sectors represented in the community. */

export type Industry = {
  key: string;
  name: string;
  short: string;
  icon: string;
  image: string;
  /** Small crop for the filmstrip. */
  thumb: string;
  /**
   * Member companies operating in this sector, shown on a plate under the
   * sector name. Optional - a sector with none simply omits the plate.
   * `href` is where its "Know more" button points; falls back to the
   * membership application, since there are no per-brand pages yet.
   */
  brands?: {
    name: string;
    /** Optional - a brand with no mark is credited by name alone. */
    logo?: string;
    href?: string;
    /**
     * Ground the mark sits on. Light suits dark marks (most of them); a
     * white-on-transparent mark needs `dark` or it disappears.
     */
    plate?: 'light' | 'dark';
  }[];
  /** What members in this sector typically bring to the room. */
  brings: string;
  /** What they typically come looking for. */
  seeks: string;
};

export const INDUSTRIES: Industry[] = [
  {
    key: 'oil-gas',
    name: 'Petrol, Oil & Gas',
    short: 'Oil & Gas',
    brands: [{ name: 'Commissionaria Falcon', logo: '/images/brands/falcon-com.png' }],
    icon: '⬢',
    image: '/images/sectors/hd/oil-gas.webp',
    thumb: '/images/sectors/thumb/oil-gas.webp',
    brings: 'Supply contracts, trading routes, heavy infrastructure experience',
    seeks: 'Capital partners, logistics, regulatory expertise',
  },
  {
    key: 'consulting',
    name: 'International Consulting',
    short: 'Consulting',
    brands: [
      {
        name: 'National Council of Chartered Accountants and Accounting Experts',
        logo: '/images/brands/cnca.webp',
      },
    ],
    icon: '◇',
    image: '/images/sectors/hd/consulting.webp',
    thumb: '/images/sectors/thumb/consulting.webp',
    brings: 'Market entry expertise, structuring, cross-border know-how',
    seeks: 'Clients entering new markets, local partners',
  },
  {
    key: 'healthcare',
    name: 'Healthcare, Science & Research',
    short: 'Healthcare',
    brands: [
      { name: 'IVF Mediterranean Centre', logo: '/images/brands/ivf.png' },
    ],
    icon: '◈',
    image: '/images/sectors/hd/medical-healthcare.webp',
    thumb: '/images/sectors/thumb/medical-healthcare.webp',
    brings: 'Clinical and research capability, regulated-sector discipline',
    seeks: 'Research funding, technology partners, distribution',
  },
  {
    key: 'finance',
    name: 'Trade & Finance',
    short: 'Finance',
    brands: [
      { name: 'BenX Capital Investment', logo: '/images/brands/benx-capital.png' },
    ],
    icon: '◆',
    image: '/images/sectors/hd/finance.webp',
    thumb: '/images/sectors/thumb/finance.webp',
    brings: 'Capital, trade instruments, deal structuring',
    seeks: 'Fundable projects, operators worth backing',
  },
  {
    key: 'real-estate',
    name: 'Real Estate',
    short: 'Real Estate',
    brands: [
      {
        name: 'Kalaani Realtors',
        logo: '/images/brands/kalaani-realtors.png',
        plate: 'dark',
      },
    ],
    icon: '▦',
    image: '/images/sectors/real-estate.png',
    thumb: '/images/sectors/real-estate.png',
    brings: 'Assets, development pipelines, local market access',
    seeks: 'Co-investors, contractors, tenants and operators',
  },
  {
    key: 'building',
    name: 'Building, Interior & Architecture',
    short: 'Building',
    icon: '▤',
    image: '/images/sectors/hd/interior-architecture.png',
    thumb: '/images/sectors/thumb/interior-architecture.png',
    brands: [{ name: 'MASK Architects', 
      logo: '/images/brands/mask-architects.webp',
      plate: 'dark', 
     }],
    brings: 'Design and delivery capability, trusted trades',
    seeks: 'Projects, suppliers, developer relationships',
  },
  {
    key: 'film',
    name: 'Media & Movie Production',
    short: 'Media & Movie',
    icon: '◐',
    image: '/images/sectors/hd/movie-production.webp',
    thumb: '/images/sectors/thumb/movie-production.webp',
     brands: [
      {
        name: 'Chefs Arena',
        logo: '/images/brands/chef-arena.png',
      },
    ],
    brings: 'Production capacity, creative and distribution reach',
    seeks: 'Production finance, brand partners, locations',
  },
  {
    key: 'fashion',
    name: 'Italian Fashion Consulting',
    short: 'Fashion',
    icon: '✧',
    image: '/images/sectors/hd/italian-fashion-consulting.webp',
    thumb: '/images/sectors/thumb/italian-fashion-consulting.webp',
    brands: [{ name: 'Bottega Martinese', 
      logo: '/images/brands/bottega-mart.png',
     }],
    brings: 'Manufacturing access, brand and buyer relationships',
    seeks: 'Retail partners, new markets, investment',
  },
  {
    key: 'sports',
    name: 'Sports Academy',
    short: 'Sports',
    icon: '◎',
    image: '/images/sectors/hd/football-training.webp',
    thumb: '/images/sectors/thumb/football-training.webp',
       brands: [{ name: 'FIFA', 
     }],
    brings: 'Talent pipelines, facilities, audience and sponsorship reach',
    seeks: 'Sponsors, facility investment, international partners',
  },
  {
    key: 'energy',
    name: 'Energy Division',
    short: 'Energy',
    icon: '▲',
    image: '/images/sectors/hd/solar-energy.webp',
    thumb: '/images/sectors/thumb/solar-energy.webp',
     brands: [{ name: 'Energy Division', 
      logo: '/images/brands/energy-division.png',
     }],
    brings: 'Generation and efficiency projects, long-term offtake',
    seeks: 'Project finance, land, technical partners',
  },
  {
    key: 'technology',
    name: 'Innovation & Technology',
    short: 'Technology',
    brands: [{ name: 'CMS Consulting Management System', logo: '/images/brands/cms.webp' }],
    icon: '◉',
    image: '/images/sectors/hd/innovation-technology.png',
    thumb: '/images/sectors/thumb/innovation-technology.png',
    brings: 'Software, automation, data capability for other sectors',
    seeks: 'Reference clients, industry expertise, capital',
  },
  {
    key: 'academy',
    name: 'Academy & Training Courses',
    short: 'Academy',
    icon: '⬟',
    image: '/images/sectors/hd/academy-traning.webp',
    thumb: '/images/sectors/thumb/academy-traning.webp',
    brands: [{ name: 'Scurria Studio Tributario', logo: '/images/partners/webp/scurri.webp', plate: 'dark',  }],
    brings: 'Training, certification and workforce development',
    seeks: 'Corporate clients, accreditation partners',
  },
   {
    key: 'food',
    name: 'Food & Beverage Division',
    short: 'F&B Division',
    brands: [
      {
        name: 'Sicily Restaurant',
        logo: '/images/brands/sicily.png',
      },
    ],
    icon: '◇',
    image: '/images/sectors/hd/food-s.png',
    thumb: '/images/sectors/thumb/food-s.png',
    brings: 'Hospitality brands, culinary concepts, supply networks, customer experience expertise',
    seeks: 'Investment, expansion partners, premium suppliers, franchise opportunities, technology & real-estate partners',
  },
];

/* ── 07 · PARTNERS ───────────────────────────────── */
/* Only the logos present in the project. `name` is omitted
   where the project has no name on record - nothing invented.
   `category` is left unset here on purpose - assign 'brand' | 'partner' |
   'service' by hand per entry once the real classification is known. */

export type PartnerCategory = 'brand' | 'partner' | 'service';
/** Industry label shown under each partner card. Left unset where the
   partner's business type isn't clear from the name on record - nothing
   invented. */
export type PartnerIndustry =
  | 'Hotel group'
  | 'Media House'
  | 'Medical & Hospital'
  | 'Restaurant & cafe'
  | 'Petrol Oil & Gas'
  | 'Fashion'
  | 'Real Estate'
  | 'Capital & Finance'
  | 'Interior & construction'
  | 'Energy & solar'
  | 'Law firm'
  | 'Media Channel';
export type Partner = { name?: string; src: string; category?: PartnerCategory; industry?: PartnerIndustry };

export const PARTNERS: Partner[] = [
  { name: 'BDM', src: '/images/partners/webp/jo-corp.png' ,  category: 'partner'},
  { name: 'Nat', src: '/images/partners/webp/nat.webp' ,  category: 'partner'},
  { name: 'Sebex Aviations', src: '/images/partners/webp/sebex-aviations.webp' },
  { name: 'ASRA', src: '/images/partners/webp/arazsam.png' ,  category: 'partner'},
  { name: 'Alco', src: '/images/partners/webp/falcon-bio.png',  category: 'partner' },
  { name: 'Scurri', src: '/images/brands/scurria.png' , category: 'service' },
  { name: 'MIB constructions',src: '/images/partners/webp/l1.webp' ,  category: 'partner', industry: 'Interior & construction' },
  { name: 'Agriper', src: '/images/partners/webp/extra1.webp' ,  category: 'partner' },
  { name: 'Plus Salus', src: '/images/partners/webp/extra3.webp', category: 'service', industry: 'Medical & Hospital' },
  { name: 'Energy Division', src: 'images/brands/energy-division.png' ,  category: 'partner', industry: 'Energy & solar' },
  { name: 'CMS', src: '/images/brands/cms.webp' ,  category: 'partner' },
  { name: 'BCL', src: '/images/brands/BCL.png' ,  category: 'partner' },
  // { name: 'MASK', src: '/images/brands/mask-architects.webp' ,  category: 'partner', industry: 'Interior & construction' },
  // { name: 'Bottega Martinese', src: '/images/brands/bottega-mart.png' , category: 'brand', industry: 'Fashion' },
  { name: 'Kalaani Realtors', src: '/images/brands/kalaani-realtors.png' , category: 'brand', industry: 'Real Estate' },
  { name: 'IVF Mediterranean Centre', src: '/images/brands/ivf.png',  category: 'partner', industry: 'Medical & Hospital' },
  { name: 'Commissionaria Falcon', src: '/images/brands/falcon-com.png' ,  category: 'partner', industry: 'Petrol Oil & Gas' },
  // { name: 'National Council of Chartered Accountants and Accounting Experts', src: '/images/brands/cnca.webp', category: 'service' },
  { name: 'Sicily Restaurant', src: '/images/brands/sicily.png', category: 'brand', industry: 'Restaurant & cafe' },
];

/* ── Stats ───────────────────────────────────────── */

export const STATS = [
  { value: 150, suffix: '+', label: 'Vetted members', sub: 'reviewed on merit' },
  { value: 12, suffix: '', label: 'Industries represented', sub: 'from construction to fashion' },
  { value: 80, suffix: '+', label: 'Countries reached', sub: 'members operating globally' },
];

/* ── FAQ ─────────────────────────────────────────── */

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'What is Trillion Business Community?',
    a: 'A private business community for owners, operators and investors across twelve industries - construction, finance, real estate, technology, energy, healthcare, fashion and more. Members join to discover opportunities, find the partners and expertise a project needs, and build ventures with people they can vouch for.',
  },
  {
    q: 'Who is it for?',
    a: 'Business owners, senior operators and investors who are actively building something and are prepared to contribute, not only receive. Membership is by application and reviewed on merit - what matters is whether you bring something other members need.',
  },
  {
    q: 'What do I actually get as a member?',
    a: 'Access to the members and businesses inside the community, to opportunities as they are being shaped rather than after they reach the open market, to introductions that would be cold approaches otherwise, and to the community’s Deal Room, events and working sessions where members bring live projects to the table.',
  },
  {
    q: 'How does membership help my business commercially?',
    a: 'Three routes, in practice. You find work - projects and requirements that other members bring in. You find what a deal is missing - the supplier, partner, specialist or capital that makes it viable. And you become someone the community refers work to, which compounds the longer you contribute.',
  },
  {
    q: 'What happens at community events?',
    a: 'Members meet in person and online to put real projects in front of each other - what is being built, what it needs, who can help. Alongside that, sessions and workshops where members with direct experience in a sector walk others through it.',
  },
  {
    q: 'How do I join?',
    a: 'Apply through the site. You complete a profile covering your business and what you bring, verify your identity, and the application is reviewed. Approved members get full access to the community and its Deal Room.',
  },
];

/* ── 07B · UNIVERSAL PROFIT ──────────────────────── */
/* Content ported as supplied. This is presented throughout as a proposed
   framework - "designed to", "would be", "intended to" - never rewritten
   into firmer language than the source copy uses. */

export const PROFIT = {
  tag: 'Universal Profit',
  title: 'Share the community’s profit together',
  lead: 'A portion of participating projects’ profits, shared with eligible active members.',

  /** The flow visual: value moves left to right through three nodes. Each
      gets one short line - the full explanation lives in `body`, used as
      the node's aria-label / title attribute rather than printed copy. */
  steps: [
    {
      key: 'activity',
      n: '01',
      icon: '◆',
      title: 'Business activity',
      line: 'Participating projects create value.',
      body:
        'Participating projects pursue commercial opportunities through products, services and partnerships. Their financial results form the basis for any potential profit allocation.',
    },
    {
      key: 'fund',
      n: '02',
      icon: '⬢',
      title: 'Universal Profit Fund',
      line: 'A defined portion is allocated.',
      body:
        'Under the proposed framework, a defined portion of participating projects’ net profits would be allocated to the Universal Profit Fund, according to the applicable programme and project terms.',
    },
    {
      key: 'share',
      n: '03',
      icon: '◈',
      title: 'Eligible members',
      line: 'The outcome is shared.',
      body:
        'The fund is intended to support distributions to eligible active members, including those who have not invested directly in the contributing project. Eligibility, allocation methods and distribution schedules would be set out in the final programme terms.',
    },
  ],

  tracks: [
    {
      key: 'community',
      icon: '◈',
      title: 'Community participation',
      line: 'A connection to the community’s success - no direct investment required.',
    },
    {
      key: 'direct',
      icon: '◆',
      title: 'Direct project participation',
      line: 'Invest in a project directly, under that project’s own terms.',
    },
  ],

  waysTitle: 'Meaningful participation matters',
  waysLead: 'A strong community depends on members who bring ideas, expertise and commitment.',
  ways: [
    { icon: '⬖', label: 'Warm introductions' },
    { icon: '◇', label: 'Professional expertise' },
    { icon: '✦', label: 'New opportunities' },
    { icon: '◎', label: 'Community activities' },
    { icon: '⬟', label: 'Responsible conduct' },
  ],
  waysNote: 'The final programme terms will define the requirements for active-member eligibility.',

  faqs: [
    {
      q: 'Do I need to invest in every project to benefit?',
      a: 'No - eligible active members are intended to be included without requiring direct investment in each contributing project. Separate project participation has its own terms.',
    },
    {
      q: 'Is Universal Profit a guaranteed income?',
      a: 'No. Any distribution would depend on actual profits, available funds and the applicable programme conditions. Membership alone does not guarantee a payment.',
    },
    {
      q: 'How much could I receive, and when?',
      a: 'That depends on the final allocation rules, eligibility requirements and financial results - to be communicated through the approved programme documentation.',
    },
  ],

  ctaTitle: 'Be part of what we build together.',
  ctaBody: 'Bring your expertise. Build valuable relationships. Explore shared success.',
  primary: { label: 'Explore TBC Membership', href: '/register' },
  secondary: { label: 'Speak With Our Team', href: '#faq' },

  disclaimer:
    'A proposed framework. Implementation, eligibility and any distributions remain subject to final programme terms.',
};

/* ── Hero ────────────────────────────────────────── */

export const HERO = {
  eyebrow: 'Membership by application · 12 industries · 80+ countries',
  titleLead: 'Different businesses.',
  titleMid: 'Different ideas.',
  titleAccent: 'One community for all.',
  desc:
    'A private community where business owners discover opportunities, find the expertise and capital a project needs, and build things together that none of them could build alone.',
  primary: { label: 'Apply for membership', href: '/register' },
  secondary: { label: 'See how it works', href: '#how-it-works' },
};
