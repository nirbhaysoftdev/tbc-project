// src/i18n/index.ts
//
// Centralised i18next configuration (requirement §3).
//
// Loading strategy: English is bundled statically and the other four languages
// are code-split and fetched on demand. That ordering is deliberate —
// `fallbackLng` only works if the fallback resources are present synchronously,
// so English can never be lazy. Switching to Italian loads one chunk once;
// until it arrives i18next serves English, so the UI is never blank and never
// shows raw keys.
//
// This module is import-safe on the server (static export prerenders every
// page): it initialises with English only and does no browser access.

import i18next, { i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  LanguageCode,
  SUPPORTED_CODES,
} from './languages';
import en from './resources/en';

/**
 * Namespaces, split by where they are used rather than by page, so a key has
 * one obvious home and pages that share a widget share its keys.
 *
 *   common      buttons, status words, generic empty/loading states
 *   validation  form validation and API error messages
 *   nav         navigation, sidebar, topbar, footer
 *   auth        login, register, forgot-password, onboarding
 *   dashboard   wallet, portfolio, transactions, cards, settings
 *   community   feed, directory, events, messages, deal room
 *   admin       admin console, member management, investments, logs
 *   landing     the public marketing page
 */
export const NAMESPACES = [
  'common',
  'validation',
  'nav',
  'auth',
  'dashboard',
  'community',
  'admin',
  'landing',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NS: Namespace = 'common';

// Static map rather than a template-literal import: bundlers can only
// code-split dynamic imports they can see at build time.
const LOADERS: Record<Exclude<LanguageCode, 'en'>, () => Promise<{ default: Record<string, unknown> }>> = {
  it: () => import('./resources/it'),
  ru: () => import('./resources/ru'),
  fa: () => import('./resources/fa'),
  ar: () => import('./resources/ar'),
};

const loaded = new Set<LanguageCode>(['en']);
const inFlight = new Map<LanguageCode, Promise<void>>();

/**
 * Ensure a language's resource bundles are registered.
 *
 * Concurrent calls for the same language share one promise, so a fast
 * double-click on the selector cannot trigger two fetches. A failed chunk load
 * resolves rather than rejects: the caller still switches language and simply
 * gets English text, which is the documented fallback behaviour.
 */
export async function loadLanguage(lang: LanguageCode): Promise<void> {
  if (loaded.has(lang)) return;
  const existing = inFlight.get(lang);
  if (existing) return existing;

  const loader = LOADERS[lang as Exclude<LanguageCode, 'en'>];
  if (!loader) return;

  const task = loader()
    .then((mod) => {
      const bundles = mod.default as Record<string, Record<string, unknown>>;
      for (const ns of NAMESPACES) {
        if (bundles[ns]) {
          // deep=true / overwrite=true so a reload during development replaces
          // rather than merges stale keys.
          i18next.addResourceBundle(lang, ns, bundles[ns], true, true);
        }
      }
      loaded.add(lang);
    })
    .catch((err) => {
      // Never rethrow: a missing translation chunk must not break navigation.
      console.warn(`[i18n] could not load "${lang}" resources, using English`, err);
    })
    .finally(() => {
      inFlight.delete(lang);
    });

  inFlight.set(lang, task);
  return task;
}

export function isLanguageLoaded(lang: LanguageCode): boolean {
  return loaded.has(lang);
}

let initialised = false;

/**
 * Idempotent init. Called by I18nProvider on mount and safe to call again
 * (React 18 StrictMode double-invokes effects in development).
 */
export function initI18n(initialLanguage: LanguageCode = DEFAULT_LANGUAGE): I18nInstance {
  if (initialised) return i18next;
  initialised = true;

  i18next
    .use(initReactI18next)
    .init({
      // Language detection is NOT delegated to i18next-browser-languagedetector
      // here: precedence in src/i18n/preference.ts has to consider the signed-in
      // profile and the explicit/detected distinction, which the plugin has no
      // concept of. The detector is still used, but as one input to that
      // resolver (see detectBrowserLanguage), not as the decision-maker.
      lng: initialLanguage,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_CODES],
      // "it-IT" must resolve to the "it" bundle, not miss entirely.
      load: 'languageOnly',
      nonExplicitSupportedLngs: true,

      ns: [...NAMESPACES],
      defaultNS: DEFAULT_NS,
      fallbackNS: DEFAULT_NS,

      resources: { en },

      interpolation: {
        // React escapes for us; double-escaping mangles apostrophes in Italian
        // and the Arabic comma.
        escapeValue: false,
      },

      // A missing key renders its English value, and if English is missing too
      // it renders the key's last segment rather than an empty element — so a
      // forgotten string is visible in review but never an invisible button.
      parseMissingKeyHandler: (key: string) => {
        const leaf = key.split('.').pop() || key;
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[i18n] missing key: ${key}`);
        }
        return leaf;
      },
      returnNull: false,
      // TRUE on purpose. With `false`, i18next treats an empty translation as
      // a miss and falls through to the missing-key handler — which turned the
      // deliberately blank `advantages.cards.banking.footLeft` into the literal
      // text "footLeft" on the landing page. An intentional blank has to render
      // as a blank.
      //
      // This is safe because the resource files are kept at full parity: a key
      // is either translated or absent, never present-but-empty by accident.
      returnEmptyString: true,

      react: {
        // The provider gates rendering until the initial language is ready, so
        // component-level Suspense would only add flicker.
        useSuspense: false,
      },

      // Keeps the console usable in development without hiding real problems.
      debug: false,
    })
    .catch((err) => {
      console.error('[i18n] init failed', err);
    });

  return i18next;
}

export default i18next;
