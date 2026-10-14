// src/services/i18n/languages.js
//
// The server-side allowlist. This MUST stay identical to
// frontend/src/i18n/languages.ts — a language the frontend can render but the
// backend rejects (or vice versa) produces content in one language and chrome
// in another.
//
// Everything that accepts a language from outside — the Accept-Language
// header, the ?lang query parameter, PATCH /profile/language, a translation
// job row — passes through normalizeLanguage() here first. Nothing downstream
// ever sees an unvalidated code, which is what keeps a language code from
// reaching a database query or a provider request as arbitrary input.

const DEFAULT_LANGUAGE = 'en';

const LANGUAGES = [
  { code: 'en', nativeName: 'English',  englishName: 'English', dir: 'ltr' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', dir: 'ltr' },
  { code: 'ru', nativeName: 'Русский',  englishName: 'Russian', dir: 'ltr' },
  { code: 'fa', nativeName: 'فارسی',    englishName: 'Persian', dir: 'rtl' },
  { code: 'ar', nativeName: 'العربية',  englishName: 'Arabic',  dir: 'rtl' },
];

const SUPPORTED = LANGUAGES.map((l) => l.code);

/** Languages that are actually translated INTO. English is the source. */
const TARGET_LANGUAGES = SUPPORTED.filter((c) => c !== DEFAULT_LANGUAGE);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

function isSupported(code) {
  return typeof code === 'string' && BY_CODE.has(code);
}

/**
 * Narrow any incoming tag to a supported code, or null.
 *
 * Regioned and oddly-cased tags are accepted because that is what real
 * Accept-Language headers contain ("it-IT", "ru_RU", "AR"). Returns null
 * rather than English for anything unsupported so callers can distinguish
 * "asked for Japanese" from "asked for English".
 */
function normalizeLanguage(tag) {
  if (typeof tag !== 'string') return null;
  const base = tag.trim().toLowerCase().replace('_', '-').split('-')[0];
  return isSupported(base) ? base : null;
}

/** Same as normalizeLanguage but never null — use where a value is required. */
function coerceLanguage(tag) {
  return normalizeLanguage(tag) || DEFAULT_LANGUAGE;
}

/**
 * Parse a full Accept-Language header, honouring quality values.
 *
 * "fa;q=0.9, it-IT, en;q=0.4, ja" → "it" (highest q among supported; the
 * implicit q for a tag without one is 1).
 *
 * Returns null when the header names no supported language at all, which lets
 * the caller fall through to the next signal rather than silently choosing.
 */
function parseAcceptLanguage(header) {
  if (typeof header !== 'string' || !header.trim()) return null;
  if (header.trim() === '*') return null;

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return {
        lang: normalizeLanguage(tag),
        q: Number.isFinite(q) ? q : 0,
      };
    })
    .filter((c) => c.lang && c.q > 0);

  if (!candidates.length) return null;
  // Stable sort by descending q; ties keep header order, which is the client's
  // own priority.
  candidates.sort((a, b) => b.q - a.q);
  return candidates[0].lang;
}

function directionOf(code) {
  const norm = normalizeLanguage(code);
  return norm ? BY_CODE.get(norm).dir : 'ltr';
}

module.exports = {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  SUPPORTED,
  TARGET_LANGUAGES,
  isSupported,
  normalizeLanguage,
  coerceLanguage,
  parseAcceptLanguage,
  directionOf,
};
