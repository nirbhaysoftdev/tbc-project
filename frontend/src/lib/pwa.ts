'use client';
// src/lib/pwa.ts
//
// Everything the portal knows about being installed as an app: whether it is
// running as one, whether this browser can install it, and how.
//
// THERE IS NO ONE WAY TO INSTALL A WEB APP, which is the whole reason this
// file exists rather than a button that calls one API:
//
//   Chrome / Edge, Android and desktop   fire `beforeinstallprompt`, and we
//                                        can show the real OS install dialog.
//   Safari on iOS and iPadOS             has no such event and never will.
//                                        The member does it by hand through
//                                        the Share sheet, so all we can do is
//                                        show them exactly where to tap.
//   Chrome/Firefox/Edge on iOS           are Safari underneath but WITHOUT the
//                                        "Add to Home Screen" item, so the
//                                        instructions have to start with
//                                        "open this in Safari".
//   An in-app browser (Instagram, …)     cannot install anything at all.
//   Safari on macOS 14+                  installs through File → Add to Dock.
//   Firefox on desktop                   does not install web apps.
//
// `beforeinstallprompt` FIRES ONCE, AND EARLY - usually before any React
// component has mounted. It is therefore captured at module scope, the moment
// this file is imported, and parked in `deferred` for whichever component asks
// for it later. A listener added inside a `useEffect` misses it on a cold load
// and the Install button never appears.

export type InstallMode =
  /** The browser offered us its own install dialog. One tap. */
  | 'prompt'
  /** Safari on iPhone / iPad: Share → Add to Home Screen. */
  | 'ios-safari'
  /** A non-Safari browser on iOS: it has to be opened in Safari first. */
  | 'ios-other'
  /** Safari on macOS: File → Add to Dock. */
  | 'mac-safari'
  /** Installable in principle, but this browser gives us nothing to show. */
  | 'unsupported';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_AT = 'tbc_install_dismissed_at';
const INSTALLED = 'tbc_install_done';

/** How long a "Not now" is honoured before the banner may ask again. */
export const SNOOZE_DAYS = 14;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const subscribers = new Set<() => void>();

const notify = () => subscribers.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this the browser shows its own mini-infobar and our banner would
    // be the second thing asking for the same thing.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    try { localStorage.setItem(INSTALLED, '1'); } catch { /* storage blocked */ }
    notify();
  });
}

export const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
};

export const hasDeferredPrompt = () => deferred !== null;

/** Running from the home screen / dock rather than in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
  // The iOS-only flag, which predates display-mode and is still the only
  // reliable answer in a home-screen web app.
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac. A Mac with a touchscreen is an iPad.
  return navigator.platform === 'MacIntel'
    && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
}

/** An embedded webview - Instagram, Facebook, LinkedIn, WeChat, Line. */
export function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|LinkedInApp|Twitter|MicroMessenger|Line\//i.test(navigator.userAgent);
}

function iosBrowserIsSafari(): boolean {
  const ua = navigator.userAgent;
  // Every one of these is Safari's engine wearing another badge, and none of
  // them has "Add to Home Screen" in its share sheet.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Brave/i.test(ua) && !isInAppBrowser();
}

/**
 * How this browser installs the app, given that it is not installed already.
 * `installMode` answers "what do we tell them?", never "may we ask?" - the
 * snooze and the standalone check are separate questions, deliberately.
 */
export function installMode(): InstallMode {
  if (typeof navigator === 'undefined') return 'unsupported';
  if (deferred) return 'prompt';

  if (isIOS()) return iosBrowserIsSafari() ? 'ios-safari' : 'ios-other';

  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
  if (isSafari) return 'mac-safari';

  // Chrome and Edge on Android and desktop reach here only before
  // `beforeinstallprompt` has fired, or after it has already been used once.
  return 'unsupported';
}

export function wasInstalled(): boolean {
  if (installed) return true;
  try { return localStorage.getItem(INSTALLED) === '1'; } catch { return false; }
}

export function isSnoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_AT) || 0);
    if (!at) return false;
    return Date.now() - at < SNOOZE_DAYS * 86400000;
  } catch {
    // Storage blocked: never nag. A banner that cannot remember a "no" would
    // come back on every single page load.
    return true;
  }
}

export function snooze() {
  try { localStorage.setItem(DISMISSED_AT, String(Date.now())); } catch { /* ignored */ }
}

/** Clears the snooze, so "Install app" from a menu always shows the banner. */
export function unsnooze() {
  try { localStorage.removeItem(DISMISSED_AT); } catch { /* ignored */ }
  notify();
}

/**
 * Show the browser's own install dialog. Resolves to what the member chose, or
 * null when there was no dialog to show.
 */
export async function showInstallPrompt(): Promise<'accepted' | 'dismissed' | null> {
  if (!deferred) return null;
  const event = deferred;
  // A deferred prompt may be used once. Dropping it first means a double click
  // cannot call prompt() twice, which throws.
  deferred = null;
  notify();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return null;
  }
}

/**
 * Unregister every worker and drop our caches. The dev-mode path, and the way
 * a browser that picked one up in development heals itself.
 */
function unregisterServiceWorkers() {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => undefined);
  if (typeof caches !== 'undefined') {
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tbc-')).map((k) => caches.delete(k))))
      .catch(() => undefined);
  }
}

/**
 * Register the service worker. Without one the browser will not offer to
 * install the site at all; see public/sw.js for what it does and does not do.
 *
 * NEVER IN DEVELOPMENT. `next dev` serves chunks at stable, UNhashed paths
 * (`/_next/static/chunks/app/admin/page.js`), and the worker treats everything
 * under `/_next/static` as immutable - correctly, because a production build
 * puts a content hash in the filename. In dev that combination pins whatever
 * JavaScript was cached first and every later edit is invisible: the dev
 * server recompiles, the browser reloads, and the old code runs. So in
 * development the worker is actively removed rather than merely skipped, which
 * is also what repairs a browser that registered one before this existed.
 *
 * Only over HTTPS or on localhost - anywhere else `register()` throws and
 * there is nothing to report, because a plain-HTTP deployment cannot be
 * installed.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  if (process.env.NODE_ENV !== 'production') {
    unregisterServiceWorkers();
    return;
  }

  if (!window.isSecureContext) return;

  const start = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // An unregistrable worker is not an error the member can act on: the
      // portal works exactly as before, it just cannot be installed.
    });
  };

  // `load` has usually already fired by the time React mounts this, and a
  // listener added after the event never runs - which left the worker
  // unregistered, and the site uninstallable, depending on how fast the page
  // hydrated.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
