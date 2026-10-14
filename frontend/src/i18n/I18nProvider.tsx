'use client';
// src/i18n/I18nProvider.tsx
//
// The one place language state lives (requirement §4.3, §5, §10).
//
// Mounted once in the root layout, above AuthProvider, so:
//   - every page and component in the tree can call useTranslation()
//   - the signed-in user's saved locale can be pushed up from AuthProvider
//     through setProfileLanguage() without this file knowing about auth
//   - document lang/dir is set in exactly one effect rather than per page
//
// Switching language never reloads, never navigates and never touches the
// session: it sets state, lazy-loads that language's chunk, and lets React
// re-render. The URL is untouched by design — pages and routes are shared
// across all five languages (§4, §16).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { I18nextProvider } from 'react-i18next';
import i18nInstance, { initI18n, loadLanguage } from './index';
import {
  DEFAULT_LANGUAGE,
  Direction,
  LANGUAGES,
  LanguageCode,
  LanguageDef,
  directionOf,
  languageDef,
  normalizeLanguage,
} from './languages';
import {
  PreferenceSource,
  detectBrowserLanguage,
  readStoredPreference,
  resolveLanguage,
  writeStoredPreference,
} from './preference';

interface I18nCtx {
  language: LanguageCode;
  dir: Direction;
  isRtl: boolean;
  /** BCP-47 tag for Intl.NumberFormat / Intl.DateTimeFormat. */
  locale: string;
  definition: LanguageDef;
  languages: readonly LanguageDef[];
  /** Why the current language is the current language — useful in tests. */
  source: PreferenceSource;
  /** True until the initial resolution has run; gates the first paint. */
  initialising: boolean;
  /** A translation chunk is in flight. The UI stays usable (English) meanwhile. */
  switching: boolean;
  /**
   * A human picked this language. Persists locally, and to the user's profile
   * when `persistRemote` is wired by AuthProvider.
   */
  setLanguage: (lang: LanguageCode) => void;
  /** Called by AuthProvider when a signed-in user's saved locale arrives. */
  setProfileLanguage: (lang: unknown) => void;
  /**
   * Registered by AuthProvider so an explicit choice can be written to the
   * user's profile. Null when nobody is signed in.
   */
  registerRemotePersist: (fn: ((lang: LanguageCode) => void) | null) => void;
}

const Ctx = createContext<I18nCtx | null>(null);

/**
 * Country → language, used ONLY as the weakest signal and only when nothing
 * else is known (§5). Countries are mapped to a language the app actually
 * ships; everything unmapped simply yields nothing and English wins.
 *
 * This is intentionally a small static table rather than a geolocation
 * subscription: country is not evidence of a language preference, so it does
 * not justify a paid lookup or a per-visit network round trip.
 */
const COUNTRY_LANGUAGE: Record<string, LanguageCode> = {
  IT: 'it', SM: 'it', VA: 'it', CH: 'it',
  RU: 'ru', BY: 'ru', KZ: 'ru', KG: 'ru', AM: 'ru', AZ: 'ru', MD: 'ru', UZ: 'ru', TJ: 'ru',
  IR: 'fa', AF: 'fa',
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', EG: 'ar', JO: 'ar',
  LB: 'ar', IQ: 'ar', SY: 'ar', LY: 'ar', MA: 'ar', TN: 'ar', DZ: 'ar', SD: 'ar',
  YE: 'ar', PS: 'ar', MR: 'ar',
};

const IP_CACHE_KEY = 'tbc_lang_ip';

/**
 * Ask the API which country the request appears to come from.
 *
 * Deliberately cheap and deliberately optional:
 *   - the answer is cached in sessionStorage, so at most one call per session
 *   - a failure, a timeout or a missing endpoint resolves to null
 *   - it is never awaited before the first paint
 *
 * The backend derives the country from proxy headers it already receives; no
 * third-party geolocation provider and no API secret is involved (§5, §11).
 */
async function fetchIpSuggestion(): Promise<LanguageCode | null> {
  if (typeof window === 'undefined') return null;
  try {
    const cached = window.sessionStorage.getItem(IP_CACHE_KEY);
    if (cached !== null) return normalizeLanguage(cached);
  } catch { /* sessionStorage unavailable — just skip the cache */ }

  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${base}/i18n/suggest`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { country?: string; language?: string };
    const lang =
      normalizeLanguage(data.language) ??
      (data.country ? COUNTRY_LANGUAGE[data.country.toUpperCase()] ?? null : null);
    try { window.sessionStorage.setItem(IP_CACHE_KEY, lang ?? ''); } catch { /* ignore */ }
    return lang;
  } catch {
    // VPN, proxy, offline, endpoint absent, slow network — all identical here.
    try { window.sessionStorage.setItem(IP_CACHE_KEY, ''); } catch { /* ignore */ }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start at English with no storage access so the server-rendered HTML of the
  // static export and the first client render agree (no hydration mismatch).
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [source, setSource] = useState<PreferenceSource>('fallback');
  const [initialising, setInitialising] = useState(true);
  const [switching, setSwitching] = useState(false);

  const remotePersist = useRef<((lang: LanguageCode) => void) | null>(null);
  // A selector click in this session outranks every later signal, including a
  // profile locale that arrives afterwards from a slow /auth/me.
  const sessionChoice = useRef<LanguageCode | null>(null);

  initI18n(DEFAULT_LANGUAGE);

  /** Single funnel for every language change, whatever triggered it. */
  const applyLanguage = useCallback(
    async (lang: LanguageCode, nextSource: PreferenceSource) => {
      setSource(nextSource);
      if (lang === language && i18nInstance.language === lang) return;
      setSwitching(true);
      try {
        await loadLanguage(lang);
        await i18nInstance.changeLanguage(lang);
      } catch (err) {
        // changeLanguage only rejects on a backend/plugin error; resources are
        // already in memory. English remains active, which is the fallback.
        console.warn('[i18n] could not activate language', lang, err);
      } finally {
        setLanguageState(lang);
        setSwitching(false);
      }
    },
    [language],
  );

  // ── Initial resolution ────────────────────────────────────────────────────
  // Runs once, client-side only. Resolves from everything synchronously
  // available first and paints immediately; the IP suggestion is folded in
  // afterwards and only if literally nothing else was known.
  useEffect(() => {
    let cancelled = false;

    const stored = readStoredPreference();
    const browser = detectBrowserLanguage();
    const first = resolveLanguage({ stored, browser });

    void applyLanguage(first.lang, first.source).then(() => {
      if (!cancelled) setInitialising(false);
    });

    if (first.source === 'fallback') {
      void fetchIpSuggestion().then((ip) => {
        if (cancelled || !ip) return;
        // Re-resolve rather than assigning: anything stronger that arrived
        // while the request was in flight must still win.
        const again = resolveLanguage({
          session: sessionChoice.current,
          stored: readStoredPreference(),
          browser: detectBrowserLanguage(),
          ip,
        });
        if (again.source === 'ip') void applyLanguage(again.lang, 'ip');
      });
    }

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Document language and direction (§10) ─────────────────────────────────
  // Centralised here so no page, layout or component does its own direction
  // logic. `dir` on <html> is what flips every CSS logical property at once.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const def = languageDef(language);
    const root = document.documentElement;
    root.setAttribute('lang', def.code);
    root.setAttribute('dir', def.dir);
    // Lets CSS target a language without parsing `lang`, e.g. for font stacks
    // that need a Persian or Arabic face.
    root.setAttribute('data-lang', def.code);
  }, [language]);

  const setLanguage = useCallback(
    (lang: LanguageCode) => {
      sessionChoice.current = lang;
      writeStoredPreference(lang, true);
      void applyLanguage(lang, 'session');
      // Fire-and-forget: a failed profile write must not undo the UI change or
      // surface an error, because the choice is already persisted locally.
      remotePersist.current?.(lang);
    },
    [applyLanguage],
  );

  const setProfileLanguage = useCallback(
    (raw: unknown) => {
      const lang = normalizeLanguage(raw);
      if (!lang) return;
      // An explicit click in this session beats the stored profile value, so a
      // member who switches language mid-session is not snapped back by a
      // refresh of /auth/me.
      if (sessionChoice.current) return;
      writeStoredPreference(lang, false);
      void applyLanguage(lang, 'profile');
    },
    [applyLanguage],
  );

  const registerRemotePersist = useCallback(
    (fn: ((lang: LanguageCode) => void) | null) => {
      remotePersist.current = fn;
    },
    [],
  );

  const value = useMemo<I18nCtx>(() => {
    const def = languageDef(language);
    return {
      language,
      dir: def.dir,
      isRtl: def.dir === 'rtl',
      locale: def.locale,
      definition: def,
      languages: LANGUAGES,
      source,
      initialising,
      switching,
      setLanguage,
      setProfileLanguage,
      registerRemotePersist,
    };
  }, [language, source, initialising, switching, setLanguage, setProfileLanguage, registerRemotePersist]);

  return (
    <I18nextProvider i18n={i18nInstance}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </I18nextProvider>
  );
}

/**
 * Language state and the switcher.
 *
 * Returns a safe inert default instead of throwing when no provider is above
 * it: a missing provider must not be able to white-screen a page, and tests
 * that render a single component in isolation stay simple.
 */
export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    language: DEFAULT_LANGUAGE,
    dir: 'ltr',
    isRtl: false,
    locale: languageDef(DEFAULT_LANGUAGE).locale,
    definition: languageDef(DEFAULT_LANGUAGE),
    languages: LANGUAGES,
    source: 'fallback',
    initialising: false,
    switching: false,
    setLanguage: () => {},
    setProfileLanguage: () => {},
    registerRemotePersist: () => {},
  };
}

/** Direction-only consumer, for components that just need to flip an icon. */
export function useDirection(): { dir: Direction; isRtl: boolean } {
  const { dir, isRtl } = useI18n();
  return { dir, isRtl };
}

export { directionOf };
