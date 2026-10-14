// src/i18n/format.ts
//
// Locale-aware number, currency and date formatting (requirement §10
// "handle ... currency and numeric values").
//
// The functions here read the ACTIVE i18next language rather than taking a
// locale argument. That is what lets the existing `formatEur()` call sites —
// there are dozens across the dashboard, portfolio, transactions and admin
// pages — become locale-aware without being edited one by one, and it means a
// language switch reformats every figure on screen in the same render pass.
//
// NUMERALS: Persian and Arabic are formatted with WESTERN digits
// (`-u-nu-latn`), not Eastern Arabic-Indic ones. This is a deliberate product
// decision, not an oversight. The application is a euro-denominated finance
// product whose figures are read alongside IBANs, reference codes and
// statements that are themselves Latin-script, and mixing numeral systems
// inside one balance table makes amounts genuinely hard to compare. The
// surrounding prose is still fully translated and still reads right-to-left.
// Change the NUMBERING_OVERRIDE map below if that trade-off should go the other
// way.

import i18n from './index';
import { DEFAULT_LANGUAGE, languageDef, normalizeLanguage } from './languages';

/** Languages that keep Western digits despite their locale's default. */
const NUMBERING_OVERRIDE: Record<string, string> = {
  fa: 'fa-IR-u-nu-latn',
  ar: 'ar-AE-u-nu-latn',
};

/** The BCP-47 tag to format with, derived from whatever i18next has active. */
export function activeLocale(): string {
  const lang = normalizeLanguage(i18n?.language) || DEFAULT_LANGUAGE;
  return NUMBERING_OVERRIDE[lang] || languageDef(lang).locale;
}

// Intl formatters are comparatively expensive to construct and are immutable
// once built, so they are memoised per locale+options rather than rebuilt on
// every table row.
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = numberCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, options);
    } catch {
      // An environment without the requested locale data (older Safari, a
      // trimmed Node ICU) must not throw inside a render.
      f = new Intl.NumberFormat('en', options);
    }
    numberCache.set(key, f);
  }
  return f;
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = dateCache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, options);
    } catch {
      f = new Intl.DateTimeFormat('en', options);
    }
    dateCache.set(key, f);
  }
  return f;
}

/**
 * Euro amounts. Fraction digits are 0–2, matching the shape this application
 * has always rendered, so a whole number stays "€1,200" rather than becoming
 * "€1,200.00".
 */
export function formatCurrency(value?: number | null, currency = 'EUR'): string {
  const safe = Number(value) || 0;
  return numberFormatter(activeLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatNumber(value?: number | null, options: Intl.NumberFormatOptions = {}): string {
  const safe = Number(value) || 0;
  return numberFormatter(activeLocale(), options).format(safe);
}

export function formatPercent(value?: number | null, fractionDigits = 1): string {
  const safe = Number(value) || 0;
  return numberFormatter(activeLocale(), {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(safe / 100);
}

/** Short date, e.g. 13/10/2026 — the format follows the locale's convention. */
export function formatDate(
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateFormatter(activeLocale(), options).format(date);
}

export function formatDateTime(value?: string | number | Date | null): string {
  return formatDate(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Long date, for headings and event cards. */
export function formatDateLong(value?: string | number | Date | null): string {
  return formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "3 days ago" in the active language, using Intl.RelativeTimeFormat so the
 * plural rules are the locale's own (Russian has three plural forms; Arabic
 * has six).
 */
export function formatRelative(value?: string | number | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = date.getTime() - Date.now();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];

  try {
    const rtf = new Intl.RelativeTimeFormat(activeLocale(), { numeric: 'auto' });
    for (const [unit, ms] of units) {
      if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
    }
    return rtf.format(0, 'minute');
  } catch {
    return formatDate(date);
  }
}
