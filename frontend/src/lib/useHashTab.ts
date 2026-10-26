'use client';
// src/lib/useHashTab.ts
//
// A tabbed page whose current tab lives in the URL hash, so the sidebar can
// link straight to one ("Approvals" -> /admin#pending), the browser's Back
// button steps between tabs, and a link an admin pastes to a colleague opens
// where they meant.
//
// WHY THE HASH AND NOT `?tab=`. Reading a query parameter in a client
// component means `useSearchParams()`, which Next requires to sit inside a
// Suspense boundary and which fails the static export this portal ships as.
// The hash is never sent to the server, needs no boundary, and `hashchange`
// is a plain DOM event - so this works the same in the dev server and in the
// exported bundle.
//
// `hashchange` IS NOT ENOUGH ON ITS OWN, which is what the subscription below
// exists for. The browser fires it when the location changes by itself - a
// real anchor, Back, an edited address bar - but NOT for `history.pushState`,
// and pushState is how both halves of this feature move:
//
//   - a `next/link` to /admin#members, clicked while already on /admin, is a
//     client-side navigation: Next pushes the new URL and no event fires;
//   - `select()` below pushes the tab it was given, for the same reason.
//
// So a sidebar row went nowhere once an admin was already inside the panel,
// and the sidebar highlight did not follow the panel's own tabs. Patching
// pushState/replaceState once, here, makes every one of those paths announce
// itself, and every reader of the hash - the panel and the sidebar - stays in
// step whichever way the admin moved.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Fired by the patch below. Nothing outside this file should dispatch it. */
const LOCATION_CHANGE = 'tbc:locationchange';

let patched = false;

/**
 * Make `history.pushState` / `replaceState` emit an event, once per document.
 *
 * It is a patch of a browser built-in, which is worth being uneasy about, so:
 * it is idempotent, it calls through to the original before doing anything,
 * and it cannot throw into the caller. The alternative - polling
 * `location.hash` on an interval - is worse in every way.
 */
function patchHistory() {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  (['pushState', 'replaceState'] as const).forEach((name) => {
    const original = history[name];
    history[name] = function patchedMethod(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      try {
        window.dispatchEvent(new Event(LOCATION_CHANGE));
      } catch { /* an event listener threw; not this function's problem */ }
      return result;
    } as History[typeof name];
  });
}

/** Subscribe to every way the URL's hash can change. */
function subscribeToHash(onChange: () => void): () => void {
  patchHistory();
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  window.addEventListener(LOCATION_CHANGE, onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(LOCATION_CHANGE, onChange);
  };
}

const readHash = () =>
  (typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));

/**
 * The current URL hash, without the '#', kept up to date however it changed.
 *
 * The server snapshot is '' because the static export is prerendered without
 * a hash; the first client render then corrects it, which is exactly what
 * useSyncExternalStore is for.
 */
export function useLocationHash(): string {
  return useSyncExternalStore(subscribeToHash, readHash, () => '');
}

/**
 * @param valid   the tabs this page has. Anything else in the hash is ignored
 *                rather than rendering an empty page for a stale link.
 * @param initial the tab to show when the hash is empty or unrecognised.
 */
export function useHashTab<T extends string>(valid: readonly T[], initial: T): [T, (tab: T) => void] {
  const hash = useLocationHash();

  // Starts on `initial` rather than on the hash: the first client render has to
  // match what was prerendered, or React logs a hydration mismatch. `mounted`
  // is what releases it, one effect later.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const tab: T = mounted && (valid as readonly string[]).includes(hash)
    ? (hash as T)
    : initial;

  const select = useCallback((next: T) => {
    if (typeof window === 'undefined') return;
    // `replaceState` would make Back skip the whole page; pushing means Back
    // steps through the tabs the way the admin actually moved. The patch above
    // turns this into the event every reader of the hash is listening for.
    if (window.location.hash.replace(/^#/, '') !== next) {
      window.history.pushState(null, '', `#${next}`);
    }
  }, []);

  return [tab, select];
}
