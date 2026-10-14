// src/i18n/preference.ts
//
// Where the chosen language is remembered, and the precedence that decides it.
//
// Two things are stored, not one:
//
//   localStorage `tbc_i18n`  — {lang, explicit} . `explicit` records that a
//                              HUMAN picked this language from the selector.
//                              Automatic detection must never set it, which is
//                              what stops browser/IP guessing from quietly
//                              overwriting a deliberate choice on the next load.
//   cookie       `tbc_lang`  — the bare code, first-party. Exists so the API
//                              can read a language even on a request that
//                              somehow carries no Accept-Language.
//
// Nothing here stores anything about the user beyond a two-letter code.

import Cookies from 'js-cookie';
import {
  DEFAULT_LANGUAGE,
  LanguageCode,
  normalizeLanguage,
} from './languages';

const STORE_KEY  = 'tbc_i18n';
const COOKIE_KEY = 'tbc_lang';
const COOKIE_DAYS = 365;

export interface StoredPreference {
  lang: LanguageCode;
  /** A selector click, as opposed to a detected guess. */
  explicit: boolean;
}

/** Ordered weakest-to-strongest; see resolveLanguage(). */
export type PreferenceSource =
  | 'fallback'
  | 'ip'
  | 'browser'
  | 'storedDetected'
  | 'storedExplicit'
  | 'profile'
  | 'session';

export interface Resolution {
  lang: LanguageCode;
  source: PreferenceSource;
}

// localStorage throws in some privacy modes, and returns stale JSON if a
// previous version wrote a different shape. Every access is defensive: a
// broken store must degrade to "no preference", never to a crash.
function safeRead(): StoredPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const lang = normalizeLanguage((parsed as StoredPreference).lang);
    if (!lang) return null;
    return { lang, explicit: (parsed as StoredPreference).explicit === true };
  } catch {
    return null;
  }
}

export function readStoredPreference(): StoredPreference | null {
  const stored = safeRead();
  if (stored) return stored;
  // A cookie with no localStorage entry means storage was cleared but the
  // cookie survived. Treat it as a detected (weak) preference, not an explicit
  // one — we no longer know whether a human chose it.
  const fromCookie = normalizeLanguage(Cookies.get(COOKIE_KEY));
  return fromCookie ? { lang: fromCookie, explicit: false } : null;
}

export function writeStoredPreference(lang: LanguageCode, explicit: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    // Once explicit, always explicit: a later automatic detection writing the
    // same code must not downgrade the flag and re-open the door to overrides.
    const existing = safeRead();
    const sticky = explicit || (existing?.lang === lang && existing.explicit);
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ lang, explicit: sticky } satisfies StoredPreference),
    );
  } catch {
    /* private mode — the cookie below is the fallback */
  }
  try {
    Cookies.set(COOKIE_KEY, lang, {
      expires: COOKIE_DAYS,
      sameSite: 'lax',
      path: '/',
    });
  } catch {
    /* nothing more we can do; the session still works in memory */
  }
}

export function clearStoredPreference(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  try { Cookies.remove(COOKIE_KEY, { path: '/' }); } catch { /* ignore */ }
}

/**
 * First supported language among the browser's ordered preferences.
 * `navigator.languages` is already in the user's priority order.
 */
export function detectBrowserLanguage(): LanguageCode | null {
  if (typeof navigator === 'undefined') return null;
  const tags = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];
  for (const tag of tags) {
    const norm = normalizeLanguage(tag);
    if (norm) return norm;
  }
  return null;
}

/**
 * The one place precedence is decided (requirement §5).
 *
 * Strongest wins, and every input is optional:
 *
 *   1 session        — selector click in this tab, not yet persisted anywhere
 *   2 profile        — the signed-in user's saved `locale`
 *   3 storedExplicit — a selector click from a previous visit
 *   4 browser        — Accept-Language equivalent
 *   5 storedDetected — a code we guessed before and wrote down
 *   6 ip             — country-derived *suggestion* only
 *   7 fallback       — English
 *
 * Note that `browser` deliberately outranks `storedDetected`: both are guesses,
 * and the live browser setting is the fresher of the two. Neither can displace
 * `storedExplicit`, which is the rule §5 asks to be resolved explicitly.
 */
export function resolveLanguage(inputs: {
  session?: unknown;
  profile?: unknown;
  stored?: StoredPreference | null;
  browser?: unknown;
  ip?: unknown;
}): Resolution {
  const session = normalizeLanguage(inputs.session);
  if (session) return { lang: session, source: 'session' };

  const profile = normalizeLanguage(inputs.profile);
  if (profile) return { lang: profile, source: 'profile' };

  const stored = inputs.stored ?? null;
  if (stored?.explicit) return { lang: stored.lang, source: 'storedExplicit' };

  const browser = normalizeLanguage(inputs.browser);
  if (browser) return { lang: browser, source: 'browser' };

  if (stored) return { lang: stored.lang, source: 'storedDetected' };

  const ip = normalizeLanguage(inputs.ip);
  if (ip) return { lang: ip, source: 'ip' };

  return { lang: DEFAULT_LANGUAGE, source: 'fallback' };
}
