// src/lib/landing-data.ts
//
// Structure and assets for the public landing experience. The COPY lives in
// src/i18n/resources/<lang>/landing.json; this module supplies everything that
// is not language — keys, icons, images, logos, links, categories, surface
// treatments and the numbers behind the stat counters.
//
// Why factories rather than plain constants
// -----------------------------------------
// These used to be module-level `const`s holding English strings. A module
// constant is evaluated once at import time, so it cannot react to a language
// change. Each export is therefore now a `get*(t)` function: a component calls
// it with its own `t`, inside a `useMemo` keyed on `t`, and React re-renders
// the section when the language changes. The shape returned is identical to
// the old constant, so the components' markup is unchanged.
//
// Company and brand names are NOT translated. "Emirates NBD", "Barceló",
// "Kalaani Realtors" and "FIFA" are proper nouns and stay in this file; only
// the descriptive copy around them is keyed.

import type { TFunction } from 'i18next';

/** The `t` any of these factories accepts — namespace-prefixed keys. */
type T = TFunction<string[] | string, undefined>;

/* ── 01 · HERO ───────────────────────────────────── */

export const getHero = (t: T) => ({
  eyebrow: t('landing:hero.eyebrow'),
  titleLead: t('landing:hero.titleLead'),
  titleMid: t('landing:hero.titleMid'),
  titleAccent: t('landing:hero.titleAccent'),
  desc: t('landing:hero.desc'),
  // `href` is a route and never translated (§3).
  primary: { label: t('landing:hero.primary'), href: '/register' },
  secondary: { label: t('landing:hero.secondary'), href: '#how-it-works' },
});

/* ── 02 · WHAT IS IT ─────────────────────────────── */

export const getWhatItIs = (t: T) => ({
  tag: t('landing:whatItIs.tag'),
  title: t('landing:whatItIs.title'),
  lead: t('landing:whatItIs.lead'),
  body: t('landing:whatItIs.body'),
  marks: (['members', 'industries', 'reach', 'entry'] as const).map((k) => ({
    k: t(`landing:whatItIs.marks.${k}.k`),
    v: t(`landing:whatItIs.marks.${k}.v`),
  })),
});

/* ── 02B · ADVANTAGES ────────────────────────────── */
/* Institutional privileges members reach through community partners. Logo
   assets that exist in the repo are wired in; a partner with no asset renders
   as a monogram tile instead of a fabricated mark. */

export type AdvBrand = {
  key: string;
  name: string;
  sub: string;
  hoverDetail: string;
  mono?: string;
  logo?: string;
  wide?: true;
};
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

/** Brand marks and monograms, keyed. Names are proper nouns; copy is keyed. */
const ADV_BRAND_ASSETS: Record<string, { name: string; mono?: string; logo?: string; wide?: true }> = {
  enbd:        { name: 'Emirates NBD', mono: 'ENBD', logo: '/images/partners/bank-nbd.png' },
  mashreq:     { name: 'Mashreq', mono: 'M', logo: '/images/partners/bank-mashreq.png' },
  wio:         { name: 'Wio Bank', mono: 'W', logo: '/images/partners/bank-wio.png' },
  fab:         { name: 'FAB', mono: 'FAB', logo: '/images/partners/bank-fab.png' },
  sib:         { name: 'Sharjah Islamic Bank (SIB)', mono: 'SIB', wide: true, logo: '/images/partners/bank-sib.png' },
  zurich:      { name: 'Zurich Insurance', logo: '/images/partners/zurich.png' },
  legal:       { name: 'International Legal Chambers', wide: true, logo: '/images/partners/justyta.png' },
  fiscal:      { name: 'Sovereign Fiscal Consultancies', wide: true, logo: '/images/brands/cnca.webp' },
  tga:         { name: 'TGA', mono: 'TGA', logo: '/images/partners/tga.png' },
  barcelo:     { name: 'Barceló', logo: '/images/partners/webp/barcelo.png' },
  radisson:    { name: 'Radisson', logo: '/images/brands/radisson-bl.jpeg' },
  kalaani:     { name: 'Kalaani', logo: '/images/brands/kalaani-realtors.png' },
  'Eben-ezer': { name: 'Eben Ezer', logo: '/images/partners/webp/eben-exer.png' },
};

const advBrand = (t: T, key: string): AdvBrand => ({
  key,
  ...ADV_BRAND_ASSETS[key],
  name: ADV_BRAND_ASSETS[key].name,
  sub: t(`landing:advantages.brands.${key}.sub`),
  hoverDetail: t(`landing:advantages.brands.${key}.hoverDetail`),
});

/** Non-text shape of each advantage card. */
const ADV_CARDS: {
  key: string;
  cat: AdvCard['cat'];
  icon: AdvCard['icon'];
  brands: string[];
  hasDesc: boolean;
}[] = [
  { key: 'banking',      cat: 'banking',            icon: 'bank',   brands: ['enbd', 'mashreq', 'wio', 'fab', 'sib'], hasDesc: false },
  { key: 'zurich',       cat: 'insurance-law',      icon: 'shield', brands: ['zurich'],                                hasDesc: true },
  { key: 'legal-fiscal', cat: 'insurance-law',      icon: 'legal',  brands: ['legal', 'fiscal'],                       hasDesc: true },
  { key: 'tga',          cat: 'mobility-lifestyle', icon: 'jet',    brands: ['tga'],                                   hasDesc: true },
  { key: 'barcelo',      cat: 'mobility-lifestyle', icon: 'hotel',  brands: ['barcelo', 'radisson'],                   hasDesc: true },
  { key: 'kalaani',      cat: 'mobility-lifestyle', icon: 'estate', brands: ['kalaani'],                               hasDesc: true },
  { key: 'Charity',      cat: 'mobility-lifestyle', icon: 'estate', brands: ['Eben-ezer'],                             hasDesc: true },
];

/** Flags stay as emoji — a flag is not language and is never translated. */
const ADV_HUBS = [
  { key: 'dubai', flag: '🇦🇪', tagKey: 'dubaiTag' },
  { key: 'eu', flag: '🇪🇺' },
  { key: 'italy', flag: '🇮🇹' },
  { key: 'singapore', flag: '🇸🇬' },
  { key: 'china', flag: '🇨🇳' },
  { key: 'indonesia', flag: '🇮🇩' },
  { key: 'russia', flag: '🇷🇺' },
  { key: 'kenya', flag: '🇰🇪' },
];

export const getAdvantages = (t: T) => ({
  tag: t('landing:advantages.tag'),
  title: t('landing:advantages.title'),
  titleAccent: t('landing:advantages.titleAccent'),
  sub: t('landing:advantages.sub'),
  hubs: ADV_HUBS.map((h) => ({
    key: h.key,
    flag: h.flag,
    label: t(`landing:advantages.hubs.${h.key}`),
    ...(h.tagKey ? { tag: t(`landing:advantages.hubs.${h.tagKey}`) } : {}),
  })),
  categories: (['banking', 'insurance-law', 'mobility-lifestyle', 'media-medical'] as const).map((key) => ({
    key,
    label: t(`landing:advantages.categories.${key}`),
  })) as { key: AdvCard['cat']; label: string }[],
  cards: ADV_CARDS.map((c) => ({
    key: c.key,
    cat: c.cat,
    icon: c.icon,
    title: t(`landing:advantages.cards.${c.key}.title`),
    subtitle: t(`landing:advantages.cards.${c.key}.subtitle`),
    badge: t(`landing:advantages.cards.${c.key}.badge`),
    ...(c.hasDesc ? { desc: t(`landing:advantages.cards.${c.key}.desc`) } : {}),
    brands: c.brands.map((b) => advBrand(t, b)),
    footLeft: t(`landing:advantages.cards.${c.key}.footLeft`),
    footRight: t(`landing:advantages.cards.${c.key}.footRight`),
  })) as AdvCard[],
});

/**
 * Countries the advantages network reaches.
 *
 * Only `.length` is ever rendered (see GlobalReach.tsx), so these names are
 * never shown to a user and deliberately are NOT translated — doing so would
 * mean maintaining 86 country names in four languages for a number.
 */
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
   this help my business specifically? The nine outcomes are grouped into three
   tracks, because read as a flat wall of nine they all weigh the same and none
   of them lands. */

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
    | 'early' | 'direct' | 'inbound' | 'partner' | 'supply'
    | 'expertise' | 'intro' | 'idea' | 'market';
};

/** Icons and scene names — presentation, not language. */
const VALUE_CARDS: { key: string; iso: ValueCard['iso']; icon: string; featured?: true }[] = [
  { key: 'opportunities', iso: 'early',     icon: '◈', featured: true },
  { key: 'intros',        iso: 'intro',     icon: '⬖' },
  { key: 'capital',       iso: 'direct',    icon: '◆' },
  { key: 'partners',      iso: 'partner',   icon: '⬗', featured: true },
  { key: 'suppliers',     iso: 'supply',    icon: '⬢' },
  { key: 'expertise',     iso: 'expertise', icon: '◇' },
  { key: 'referrals',     iso: 'inbound',   icon: '⬟', featured: true },
  { key: 'markets',       iso: 'market',    icon: '⬣' },
  { key: 'ideas',         iso: 'idea',      icon: '✦' },
];

export const getWhyJoin = (t: T): ValueCard[] =>
  VALUE_CARDS.map((c) => ({
    key: c.key,
    iso: c.iso,
    icon: c.icon,
    ...(c.featured ? { featured: c.featured } : {}),
    tag: t(`landing:whyJoin.cards.${c.key}.tag`),
    title: t(`landing:whyJoin.cards.${c.key}.title`),
    body: t(`landing:whyJoin.cards.${c.key}.body`),
    short: t(`landing:whyJoin.cards.${c.key}.short`),
  }));

export type ValueTrack = {
  key: string;
  n: string;
  label: string;
  line: string;
  /** Photo for the track rail — reuses the sector thumbnails. */
  image: string;
  alt: string;
  cards: string[];
};

const VALUE_TRACKS: { key: string; n: string; image: string; cards: string[] }[] = [
  { key: 'flow',        n: '01', image: '/images/sectors/thumb/finance.webp',         cards: ['opportunities', 'intros', 'capital'] },
  { key: 'capability',  n: '02', image: '/images/sectors/thumb/consulting.webp',      cards: ['partners', 'suppliers', 'expertise'] },
  { key: 'compounding', n: '03', image: '/images/sectors/thumb/academy-traning.webp', cards: ['referrals', 'markets', 'ideas'] },
];

export const getWhyTracks = (t: T): ValueTrack[] =>
  VALUE_TRACKS.map((tr) => ({
    key: tr.key,
    n: tr.n,
    image: tr.image,
    cards: tr.cards,
    label: t(`landing:whyJoin.tracks.${tr.key}.label`),
    line: t(`landing:whyJoin.tracks.${tr.key}.line`),
    alt: t(`landing:whyJoin.tracks.${tr.key}.alt`),
  }));

/** The cards of one track, lead first. */
export const trackCards = (track: ValueTrack, cards: ValueCard[]): ValueCard[] =>
  track.cards
    .map((k) => cards.find((c) => c.key === k))
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

const FLOW_STEPS = [
  { key: 'discover', n: '01' },
  { key: 'connect', n: '02' },
  { key: 'collaborate', n: '03' },
  { key: 'create', n: '04' },
  { key: 'grow', n: '05' },
];

export const getFlow = (t: T): FlowStep[] =>
  FLOW_STEPS.map((s) => ({
    key: s.key,
    n: s.n,
    title: t(`landing:flow.${s.key}.title`),
    line: t(`landing:flow.${s.key}.line`),
    body: t(`landing:flow.${s.key}.body`),
    // returnObjects pulls the chip array straight out of the resource file, so
    // a language can carry a different number of chips if it reads better.
    chips: t(`landing:flow.${s.key}.chips`, { returnObjects: true }) as unknown as string[],
  }));

/* ── 05 · REAL SCENARIO ──────────────────────────── */
/* A worked example, built as a structure that assembles from the foundation
   up — one layer per member business. Order is bottom-up: index 0 is the
   foundation, the last entry is the top. */

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

/** Language-independent layer order; Scenario needs the count statically. */
export const SCENARIO_LAYER_SHAPE: { key: string; icon: string; fill: ScenarioLayer['fill'] }[] = [
  { key: 'investor',   icon: '◆', fill: 'solid' },
  { key: 'consultant', icon: '◇', fill: 'hatch' },
  { key: 'supplier',   icon: '⬢', fill: 'grain' },
  { key: 'builder',    icon: '▦', fill: 'solid' },
  { key: 'tech',       icon: '◉', fill: 'grid' },
  { key: 'marketing',  icon: '✦', fill: 'light' },
];

export const getScenario = (t: T) => ({
  tag: t('landing:scenario.tag'),
  title: t('landing:scenario.title'),
  sub: t('landing:scenario.sub'),
  opportunity: t('landing:scenario.opportunity'),
  opportunityIcon: '▦',
  layers: SCENARIO_LAYER_SHAPE.map((l) => ({
    key: l.key,
    icon: l.icon,
    fill: l.fill,
    layer: t(`landing:scenario.layers.${l.key}.layer`),
    role: t(`landing:scenario.layers.${l.key}.role`),
    brings: t(`landing:scenario.layers.${l.key}.brings`),
    gains: t(`landing:scenario.layers.${l.key}.gains`),
  })) as ScenarioLayer[],
  outcome: t('landing:scenario.outcome'),
  closing: t('landing:scenario.closing'),
});

/* ── 06 · INDUSTRIES ─────────────────────────────── */
/* The sectors represented in the community. */

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
   * sector name. Optional — a sector with none simply omits the plate.
   * Company names are proper nouns and are not translated.
   */
  brands?: {
    name: string;
    /** Optional — a brand with no mark is credited by name alone. */
    logo?: string;
    href?: string;
    /**
     * Ground the mark sits on. Light suits dark marks (most of them); a
     * white-on-transparent mark needs `dark` or it disappears.
     */
    plate?: 'light' | 'dark';
  }[];
  brings: string;
  seeks: string;
};

/**
 * The language-independent shape of the industry list: keys, icons, imagery.
 *
 * Exported because HeroStage derives its ring geometry from the list at module
 * scope, and that geometry depends only on the count and order — never on the
 * copy. Translated names come from getIndustries() at render time.
 */
export const INDUSTRY_SHAPE: {
  key: string;
  icon: string;
  image: string;
  thumb: string;
  brands?: Industry['brands'];
}[] = [
  { key: 'oil-gas',     icon: '⬢', image: '/images/sectors/hd/oil-gas.webp',                     thumb: '/images/sectors/thumb/oil-gas.webp',
    brands: [{ name: 'Commissionaria Falcon', logo: '/images/brands/falcon-com.png' }] },
  { key: 'consulting',  icon: '◇', image: '/images/sectors/hd/consulting.webp',                  thumb: '/images/sectors/thumb/consulting.webp',
    brands: [{ name: 'National Council of Chartered Accountants and Accounting Experts', logo: '/images/brands/cnca.webp' }] },
  { key: 'healthcare',  icon: '◈', image: '/images/sectors/hd/medical-healthcare.webp',          thumb: '/images/sectors/thumb/medical-healthcare.webp',
    brands: [{ name: 'IVF Mediterranean Centre', logo: '/images/brands/ivf.png' }] },
  { key: 'finance',     icon: '◆', image: '/images/sectors/hd/finance.webp',                     thumb: '/images/sectors/thumb/finance.webp',
    brands: [{ name: 'BenX Capital Investment', logo: '/images/brands/benx-capital.png' }] },
  { key: 'real-estate', icon: '▦', image: '/images/sectors/real-estate.png',                     thumb: '/images/sectors/real-estate.png',
    brands: [{ name: 'Kalaani Realtors', logo: '/images/brands/kalaani-realtors.png', plate: 'dark' }] },
  { key: 'building',    icon: '▤', image: '/images/sectors/hd/interior-architecture.png',        thumb: '/images/sectors/thumb/interior-architecture.png',
    brands: [{ name: 'MASK Architects', logo: '/images/brands/mask-architects.webp', plate: 'dark' }] },
  { key: 'film',        icon: '◐', image: '/images/sectors/hd/movie-production.webp',            thumb: '/images/sectors/thumb/movie-production.webp',
    brands: [{ name: 'Chefs Arena', logo: '/images/brands/chef-arena.png' }] },
  { key: 'fashion',     icon: '✧', image: '/images/sectors/hd/italian-fashion-consulting.webp',  thumb: '/images/sectors/thumb/italian-fashion-consulting.webp',
    brands: [{ name: 'Bottega Martinese', logo: '/images/brands/bottega-mart.png' }] },
  { key: 'sports',      icon: '◎', image: '/images/sectors/hd/football-training.webp',           thumb: '/images/sectors/thumb/football-training.webp',
    brands: [{ name: 'FIFA' }] },
  { key: 'energy',      icon: '▲', image: '/images/sectors/hd/solar-energy.webp',                thumb: '/images/sectors/thumb/solar-energy.webp',
    brands: [{ name: 'Energy Division', logo: '/images/brands/energy-division.png' }] },
  { key: 'technology',  icon: '◉', image: '/images/sectors/hd/innovation-technology.png',        thumb: '/images/sectors/thumb/innovation-technology.png',
    brands: [{ name: 'CMS Consulting Management System', logo: '/images/brands/cms.webp' }] },
  { key: 'academy',     icon: '⬟', image: '/images/sectors/hd/academy-traning.webp',             thumb: '/images/sectors/thumb/academy-traning.webp',
    brands: [{ name: 'Scurria Studio Tributario', logo: '/images/partners/webp/scurri.webp', plate: 'dark' }] },
  { key: 'food',        icon: '◇', image: '/images/sectors/hd/food-s.png',                       thumb: '/images/sectors/thumb/food-s.png',
    brands: [{ name: 'Sicily Restaurant', logo: '/images/brands/sicily.png' }] },
];

export const getIndustries = (t: T): Industry[] =>
  INDUSTRY_SHAPE.map((i) => ({
    key: i.key,
    icon: i.icon,
    image: i.image,
    thumb: i.thumb,
    ...(i.brands ? { brands: i.brands } : {}),
    name: t(`landing:industries.${i.key}.name`),
    short: t(`landing:industries.${i.key}.short`),
    brings: t(`landing:industries.${i.key}.brings`),
    seeks: t(`landing:industries.${i.key}.seeks`),
  }));

/* ── 07 · PARTNERS ───────────────────────────────── */
/* Only the logos present in the project. `name` is omitted where the project
   has no name on record — nothing invented. Partner names are proper nouns and
   are not translated; the `industry` LABEL is, through
   landing:partnerIndustry.<value>. */

export type PartnerCategory = 'brand' | 'partner' | 'service';
export type PartnerIndustry =
  | 'Hotel group' | 'Media House' | 'Hotel & Restaurant' | 'Medical & Hospital'
  | 'Restaurant & cafe' | 'Petrol Oil & Gas' | 'Fashion' | 'Real Estate'
  | 'Capital & Finance' | 'Interior & construction' | 'Energy & solar'
  | 'Law firm' | 'Media Channel';
export type Partner = { name?: string; src: string; category?: PartnerCategory; industry?: PartnerIndustry };

export const PARTNERS: Partner[] = [
  { name: 'Jo-crop', src: '/images/partners/webp/jo-corp.png', category: 'partner' },
  { name: 'Nat', src: '/images/partners/webp/nat.webp', category: 'partner' },
  { name: 'Sarni Oils', src: '/images/brands/Sarni.png', category: 'partner', industry: 'Petrol Oil & Gas' },
  { name: 'Villa Florio', src: '/images/brands/villa-fl.png', category: 'partner', industry: 'Hotel & Restaurant' },
  { name: 'Si Vallé', src: '/images/brands/su-vall.png', category: 'partner' },
  { name: 'Sebex Aviations', src: '/images/partners/webp/sebex-aviations.webp' },
  { name: 'ASRA', src: '/images/partners/webp/arazsam.png', category: 'partner' },
  { name: 'Alco', src: '/images/partners/webp/falcon-bio.png', category: 'partner' },
  { name: 'Scurri', src: '/images/brands/scurria.png', category: 'service' },
  { name: 'MIB constructions', src: '/images/partners/webp/l1.webp', category: 'partner', industry: 'Interior & construction' },
  { name: 'Agriper', src: '/images/partners/webp/extra1.webp', category: 'partner' },
  { name: 'Plus Salus', src: '/images/partners/webp/extra3.webp', category: 'service', industry: 'Medical & Hospital' },
  { name: 'Energy Division', src: 'images/brands/energy-division.png', category: 'partner', industry: 'Energy & solar' },
  { name: 'CMS', src: '/images/brands/cms.webp', category: 'partner' },
  { name: 'BCL', src: '/images/brands/BCL.png', category: 'partner' },
  { name: 'Kalaani Realtors', src: '/images/brands/kalaani-realtors.png', category: 'brand', industry: 'Real Estate' },
  { name: 'IVF Mediterranean Centre', src: '/images/brands/ivf.png', category: 'partner', industry: 'Medical & Hospital' },
  { name: 'Commissionaria Falcon', src: '/images/brands/falcon-com.png', category: 'partner', industry: 'Petrol Oil & Gas' },
  { name: 'Goethe', src: '/images/brands/goethe-.png', category: 'partner', industry: 'Hotel & Restaurant' },
  { name: 'Sicily Restaurant', src: '/images/brands/sicily.png', category: 'brand', industry: 'Restaurant & cafe' },
];

/** Translated label for a partner's industry, falling back to the raw value. */
export const partnerIndustryLabel = (t: T, industry?: PartnerIndustry): string =>
  industry ? t(`landing:partnerIndustry.${industry}`, { defaultValue: industry }) : '';

/* ── Stats ───────────────────────────────────────── */
/* `value` and `suffix` are numeric and are formatted by the counter component,
   not translated. */

const STAT_SHAPE = [
  { key: 'members', value: 150, suffix: '+' },
  { key: 'industries', value: 12, suffix: '' },
  { key: 'countries', value: 80, suffix: '+' },
];

export const getStats = (t: T) =>
  STAT_SHAPE.map((s) => ({
    key: s.key,
    value: s.value,
    suffix: s.suffix,
    label: t(`landing:stats.${s.key}.label`),
    sub: t(`landing:stats.${s.key}.sub`),
  }));

/* ── FAQ ─────────────────────────────────────────── */

const FAQ_KEYS = ['whatIsIt', 'whoFor', 'whatYouGet', 'commercial', 'events', 'howToJoin'];

export const getFaqs = (t: T): { key: string; q: string; a: string }[] =>
  FAQ_KEYS.map((k) => ({
    key: k,
    q: t(`landing:faq.${k}.q`),
    a: t(`landing:faq.${k}.a`),
  }));

/* ── 07B · UNIVERSAL PROFIT ──────────────────────── */
/* Presented throughout as a PROPOSED framework — "designed to", "would be",
   "intended to". Translations must preserve that conditional register: this is
   financial copy, and firming it up would change its legal meaning. */

const PROFIT_STEPS = [
  { key: 'activity', n: '01', icon: '◆' },
  { key: 'fund', n: '02', icon: '⬢' },
  { key: 'share', n: '03', icon: '◈' },
];
const PROFIT_TRACKS = [
  { key: 'community', icon: '◈' },
  { key: 'direct', icon: '◆' },
];
const PROFIT_WAYS = [
  { key: 'intros', icon: '⬖' },
  { key: 'expertise', icon: '◇' },
  { key: 'opportunities', icon: '✦' },
  { key: 'activities', icon: '◎' },
  { key: 'conduct', icon: '⬟' },
];
const PROFIT_FAQ_KEYS = ['invest', 'guaranteed', 'howMuch'];

export const getProfit = (t: T) => ({
  tag: t('landing:profit.tag'),
  title: t('landing:profit.title'),
  lead: t('landing:profit.lead'),
  steps: PROFIT_STEPS.map((s) => ({
    key: s.key,
    n: s.n,
    icon: s.icon,
    title: t(`landing:profit.steps.${s.key}.title`),
    line: t(`landing:profit.steps.${s.key}.line`),
    body: t(`landing:profit.steps.${s.key}.body`),
  })),
  tracks: PROFIT_TRACKS.map((tr) => ({
    key: tr.key,
    icon: tr.icon,
    title: t(`landing:profit.tracks.${tr.key}.title`),
    line: t(`landing:profit.tracks.${tr.key}.line`),
  })),
  waysTitle: t('landing:profit.waysTitle'),
  waysLead: t('landing:profit.waysLead'),
  ways: PROFIT_WAYS.map((w) => ({
    key: w.key,
    icon: w.icon,
    label: t(`landing:profit.ways.${w.key}`),
  })),
  waysNote: t('landing:profit.waysNote'),
  faqs: PROFIT_FAQ_KEYS.map((k) => ({
    key: k,
    q: t(`landing:profit.faqs.${k}.q`),
    a: t(`landing:profit.faqs.${k}.a`),
  })),
  ctaTitle: t('landing:profit.ctaTitle'),
  ctaBody: t('landing:profit.ctaBody'),
  primary: { label: t('landing:profit.primary'), href: '/register' },
  secondary: { label: t('landing:profit.secondary'), href: '#faq' },
  disclaimer: t('landing:profit.disclaimer'),
});
