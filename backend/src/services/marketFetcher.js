// src/services/marketFetcher.js
//
// The figures behind the landing page's "Live Markets" bar and Market
// Snapshot: index levels, gold, Brent, the dollar index, EUR/USD and Bitcoin.
//
// SOURCE
// Yahoo Finance's public chart endpoint. It needs no key, but it is not a
// documented API, so it can change or rate-limit without notice. That is why
// nothing here is allowed to fail loudly, and why the page hides the bar
// rather than show a number it cannot vouch for.
//
// NO INVENTED NUMBERS
// A quote is only ever what the source returned. If a symbol fails, its last
// good value is kept until it is MAX_AGE_MS old, after which it is dropped from
// the payload - a stale price on a finance page is worse than a missing one.
//
// Held in memory, not the database: a quote is worthless within the hour, the
// first refresh runs seconds after boot, and a table would only be a way to
// serve yesterday's market.
const SYMBOLS = [
  { key: 'sp500',  label: 'S&P 500',     symbol: '^GSPC',     decimals: 2 },
  { key: 'nasdaq', label: 'Nasdaq',      symbol: '^IXIC',     decimals: 2 },
  { key: 'ftse',   label: 'FTSE 100',    symbol: '^FTSE',     decimals: 2 },
  { key: 'dax',    label: 'DAX',         symbol: '^GDAXI',    decimals: 2 },
  { key: 'gold',   label: 'Gold',        symbol: 'GC=F',      decimals: 2, currency: 'USD' },
  { key: 'eurusd', label: 'EUR/USD',     symbol: 'EURUSD=X',  decimals: 4 },
  { key: 'brent',  label: 'Brent Crude', symbol: 'BZ=F',      decimals: 2, currency: 'USD' },
  { key: 'usd',    label: 'USD Index',   symbol: 'DX-Y.NYB',  decimals: 2 },
  { key: 'btc',    label: 'Bitcoin',     symbol: 'BTC-USD',   decimals: 0, currency: 'USD' },
];

const CONFIG = {
  enabled: process.env.MARKETS_ENABLED !== 'false',
  intervalMs: Number(process.env.MARKET_REFRESH_MINUTES || 10) * 60 * 1000,
  fetchTimeoutMs: 8000,
  /** A quote older than this is not shown. Covers a weekend gap in a closed market. */
  maxAgeMs: 4 * 24 * 60 * 60 * 1000,
};

const quotes = new Map();
let timer = null;
let running = false;

async function fetchOne(def) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CONFIG.fetchTimeoutMs);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (TBC-Portal)', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || price <= 0) throw new Error('no price');
    const change = Number.isFinite(prev) && prev > 0 ? price - prev : null;
    return {
      key: def.key, label: def.label, decimals: def.decimals, currency: def.currency || null,
      price,
      change,
      changePct: change == null ? null : (change / prev) * 100,
      asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
      fetchedAt: Date.now(),
    };
  } finally {
    clearTimeout(t);
  }
}

/** One pass over every symbol. A failure keeps that symbol's previous quote. */
async function refresh() {
  if (running) return;
  running = true;
  try {
    const results = await Promise.allSettled(SYMBOLS.map(fetchOne));
    results.forEach((r, i) => { if (r.status === 'fulfilled') quotes.set(SYMBOLS[i].key, r.value); });
  } finally {
    running = false;
  }
}

/** The quotes that are fresh enough to show, in display order. */
function current() {
  const now = Date.now();
  return SYMBOLS
    .map((d) => quotes.get(d.key))
    .filter((q) => q && now - q.fetchedAt <= CONFIG.maxAgeMs)
    .map(({ fetchedAt, ...q }) => q);
}

function start() {
  if (!CONFIG.enabled || timer) return;
  setTimeout(() => { refresh().catch(() => {}); }, 3000).unref?.();
  timer = setInterval(() => { refresh().catch(() => {}); }, CONFIG.intervalMs);
  timer.unref?.();
}

function stop() { if (timer) { clearInterval(timer); timer = null; } }

module.exports = { start, stop, refresh, current, SYMBOLS };
