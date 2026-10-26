// src/lib/viz.ts
//
// The chart palette and the few helpers every chart in the admin Overview
// shares. One file, so a second chart cannot quietly invent a seventh colour.
//
// WHY THESE HEXES. They are the dark steps of a categorical palette whose
// ordering is the colourblind-safety mechanism, not a taste decision, and they
// were validated as a set against this portal's card surface (#131727 — the
// 4% white of `--bg-card` over `--bg-main`):
//
//   lightness band      all 6 inside L 0.48-0.67      PASS
//   chroma floor        all 6 >= 0.1                   PASS
//   CVD separation      worst adjacent ΔE 8.4 (protan) PASS
//   normal-vision floor worst adjacent ΔE 19.3         PASS
//   contrast vs surface all 6 >= 3:1                   PASS
//
// Two rules follow from that and must not be broken:
//
//  1. **Assign in order, never cycle.** A seventh category is not a generated
//     hue - it folds into OTHER (the neutral below). That is why
//     `topSlices()` exists and why the donut is capped.
//  2. **Colour follows the entity, not its rank.** A filter that drops a
//     category must not repaint the survivors, so a slice's colour comes from
//     its position in the *sorted, capped* list computed once per payload.
export const SERIES = [
  '#3987e5', // 1 blue
  '#d95926', // 2 orange
  '#199e70', // 3 aqua
  '#c98500', // 4 yellow
  '#d55181', // 5 magenta
  '#9085e9', // 6 violet
] as const;

/** Everything past the sixth category. Deliberately neutral: it is not an identity. */
export const OTHER = '#5a617a';

/** The chart surface, used for the 2px gap between adjacent fills. */
export const SURFACE = '#131727';

export const GRID = 'rgba(255,255,255,0.06)';
export const INK = '#e8eaf6';
export const INK_MUTED = '#8c9ab5';

/** Capital in. Slot 1, everywhere it appears. */
export const CAPITAL = SERIES[0];
/** Profit out. Slot 3 - the aqua, not the green, which is reserved for status. */
export const PROFIT = SERIES[2];

/**
 * The top `max` entries by value, with the remainder folded into one "Other"
 * row. Past ~6 classes adjacent colours blur, so this is a readability rule
 * rather than a layout convenience - the full list still appears in the table
 * beside the chart, which is where the long tail belongs.
 */
export function topSlices<T extends { total: number }>(
  rows: T[],
  label: (row: T) => string,
  max = SERIES.length,
): { label: string; value: number; color: string; rest?: number }[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const head = sorted.slice(0, max);
  const tail = sorted.slice(max);

  const slices = head.map((row, i) => ({
    label: label(row),
    value: row.total,
    color: SERIES[i],
  }));

  if (tail.length) {
    slices.push({
      label: `Other (${tail.length})`,
      value: tail.reduce((sum, row) => sum + row.total, 0),
      color: OTHER,
      rest: tail.length,
    } as any);
  }

  return slices;
}

/**
 * A category string as it should read on screen.
 * `REAL_ESTATE` and `real-estate` are both "Real Estate".
 */
export const prettyCategory = (value: string): string => {
  const words = String(value || '').trim().replace(/[_-]+/g, ' ').toLowerCase();
  if (!words) return 'Uncategorised';
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * A bucket key from the API (`2026-10`, `2026-W…`, `2026-Q3`, `2026-10-05`)
 * as a short axis label. The keys sort lexically by design, so this only has to
 * read well - it never has to be parsed back.
 */
export function bucketLabel(key: string, granularity: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (granularity === 'year' || /^\d{4}$/.test(key)) return key;
  if (key.includes('Q')) return key.replace('-', ' ');

  const [y, m, d] = key.split('-');
  const month = MONTHS[Number(m) - 1] || m;
  if (d) return `${d} ${month}`;
  return `${month} ${String(y).slice(2)}`;
}

/** Compact money for an axis tick or a dense tile: €1.2M, €340k, €920. */
export function compactEur(value: number): string {
  const n = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (n >= 1_000_000) return `${sign}€${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000)     return `${sign}€${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${sign}€${Math.round(n)}`;
}

/**
 * Shared tooltip styling. Chart.js draws these on its own canvas, so they are
 * configured rather than written in CSS - this keeps every chart's tooltip the
 * same without each one repeating the block.
 */
export const TOOLTIP = {
  backgroundColor: 'rgba(10,14,30,0.96)',
  borderColor: 'rgba(255,255,255,0.12)',
  borderWidth: 1,
  titleColor: INK,
  bodyColor: INK,
  padding: 10,
  cornerRadius: 8,
  displayColors: true,
  boxWidth: 8,
  boxHeight: 8,
  boxPadding: 4,
};
