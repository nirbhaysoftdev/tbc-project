// src/services/i18n/content.js
//
// Two jobs, both about deciding *what* gets translated and *when* it changed:
//
//   hashSource()     — the content hash a translation is pinned to
//   shouldTranslate() — the filter that keeps non-language out of the provider
//
// Requirement §6.A.13 asks for empty strings, identifiers, URLs, email
// addresses, codes and structured values to be skipped. That is not only a cost
// control: machine-translating "IT-2026-0042" or "info@trillionbc.com" actively
// corrupts it.

const crypto = require('crypto');

/**
 * The identity of a piece of source text.
 *
 * Normalised before hashing so cosmetic edits — a trailing newline, Windows
 * line endings, a run of spaces an admin pasted in — do not invalidate every
 * translation of an otherwise unchanged paragraph. Case IS significant: an
 * admin fixing capitalisation is a real copy change.
 */
function hashSource(text) {
  const normalised = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalised, 'utf8').digest('hex');
}

// A value made entirely of one of these is not prose.
const PATTERNS = {
  // https://… , www.… , /uploads/x.png
  url: /^(https?:\/\/|www\.|\/)[^\s]*$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  // 12, 1.5, -3, 1,250.00, 45%, € 1 200
  numeric: /^[\s0-9.,%+\-€$£¥]*$/,
  // UUID — ids leak into text fields more often than you would hope
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  // SCREAMING_SNAKE enum values and status tokens
  enumLike: /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/,
  // IT-2026-0042, SKU_119, ABC/123 — reference codes
  code: /^[A-Z0-9]+([-_/.][A-Z0-9]+)+$/i,
  // ISO dates and timestamps
  isoDate: /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/,
};

/**
 * Minimum length worth a provider call. Two characters cannot carry meaning
 * that survives translation, and one-word tokens of that size are almost
 * always codes.
 */
const MIN_LENGTH = 3;

/**
 * True when `text` is natural language worth sending to a translation provider.
 *
 * Conservative in the safe direction: a false negative means the English
 * source is shown (the documented fallback), while a false positive means a
 * corrupted identifier and a wasted request.
 */
function shouldTranslate(text) {
  if (typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length < MIN_LENGTH) return false;

  // Markup is handled by html.js, which calls back in here per text node, so a
  // value that is only tags and whitespace has nothing to translate.
  const withoutTags = trimmed.replace(/<[^>]*>/g, '').trim();
  if (!withoutTags) return false;

  for (const pattern of Object.values(PATTERNS)) {
    if (pattern.test(trimmed)) return false;
  }

  // Must contain at least one letter in some script. "---", "###", "€ 1.200,00"
  // and "+39 02 1234567" all fail this and are correctly skipped.
  if (!/\p{L}/u.test(withoutTags)) return false;

  return true;
}

/**
 * Which translatable fields of a record actually changed, by comparing the
 * current hashes against the ones recorded for the last known version.
 *
 * Returns the changed field names only, so a save that edits a title does not
 * re-translate an untouched 4 000-character description (§6, §11).
 */
function changedFields(currentHashes, previousHashes) {
  const prev = previousHashes && typeof previousHashes === 'object' ? previousHashes : {};
  return Object.keys(currentHashes).filter((field) => prev[field] !== currentHashes[field]);
}

module.exports = {
  hashSource,
  shouldTranslate,
  changedFields,
  MIN_LENGTH,
  PATTERNS,
};
