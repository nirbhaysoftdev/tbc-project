// src/i18n/languages.ts
//
// The single source of truth for which languages exist, what they are called
// and which way they read. Everything else — the i18next config, the selector,
// the document-direction manager, the backend allowlist — derives from this
// list, so adding a sixth language is one entry here plus a resource folder.
//
// `code` values are the ONLY strings accepted anywhere as a language. They are
// deliberately plain ISO 639-1 with no region subtag: the backend allowlist in
// backend/src/services/i18n/languages.js must stay identical.

export type LanguageCode = 'en' | 'it' | 'ru' | 'fa' | 'ar';
export type Direction = 'ltr' | 'rtl';

export interface LanguageDef {
  code: LanguageCode;
  /** Shown in the selector — the language's own name, never an English gloss. */
  nativeName: string;
  /** Used for accessible labels and admin-facing English contexts. */
  englishName: string;
  dir: Direction;
  /** BCP-47 tag for Intl formatting (numbers, dates, currency). */
  locale: string;
}

export const LANGUAGES: readonly LanguageDef[] = [
  { code: 'en', nativeName: 'English',  englishName: 'English', dir: 'ltr', locale: 'en-IE' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', dir: 'ltr', locale: 'it-IT' },
  { code: 'ru', nativeName: 'Русский',  englishName: 'Russian', dir: 'ltr', locale: 'ru-RU' },
  { code: 'fa', nativeName: 'فارسی',    englishName: 'Persian', dir: 'rtl', locale: 'fa-IR' },
  { code: 'ar', nativeName: 'العربية',  englishName: 'Arabic',  dir: 'rtl', locale: 'ar-AE' },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export const SUPPORTED_CODES: readonly LanguageCode[] = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map<string, LanguageDef>(LANGUAGES.map((l) => [l.code, l]));

/** True only for a code this application actually ships resources for. */
export function isSupported(code: unknown): code is LanguageCode {
  return typeof code === 'string' && BY_CODE.has(code);
}

/**
 * Narrow any incoming tag to a supported code, or null.
 *
 * Accepts regioned and cased tags ("IT", "ru-RU", "fa_IR", "ar-EG") because
 * those are what browsers and Accept-Language headers actually send. Anything
 * unsupported returns null rather than English, so callers can tell "the user
 * asked for Japanese" (fall back) apart from "the user asked for English".
 */
export function normalizeLanguage(tag: unknown): LanguageCode | null {
  if (typeof tag !== 'string') return null;
  const base = tag.trim().toLowerCase().replace('_', '-').split('-')[0];
  return isSupported(base) ? base : null;
}

export function languageDef(code: LanguageCode): LanguageDef {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_LANGUAGE)!;
}

export function directionOf(code: unknown): Direction {
  const norm = normalizeLanguage(code);
  return norm ? languageDef(norm).dir : 'ltr';
}

export function isRtl(code: unknown): boolean {
  return directionOf(code) === 'rtl';
}
