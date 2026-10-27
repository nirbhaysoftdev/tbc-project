'use client';
// src/lib/tokenStore.ts
//
// The one place the session token is read from and written to.
//
// WHY THIS IS NOT JUST `localStorage.setItem`. Reaching for storage can
// THROW, not merely return null: Samsung Internet's Secret mode, Safari
// Private Browsing, "block all cookies" and an enterprise policy all turn
// `localStorage` into a property that raises a SecurityError on access, and
// `document.cookie` into a write that silently does nothing. An unguarded
// call therefore does not degrade - it throws straight out of whatever was
// calling it. That is exactly what a failed sign-in on one device looked
// like: the API answered 200 with a perfectly good token, `login()` threw on
// the way to storing it, and the form showed its catch-all "Login failed,
// please try again" - a server error message for a browser setting.
//
// So every access is guarded, and the two stores are independent: whichever
// one works is enough. If both are blocked the token is kept in memory, which
// lasts until the tab is closed - not a session that survives a reload, but a
// member who can actually use the portal rather than one who cannot sign in
// at all. `hasPersistentStore()` is what lets the UI say so honestly.
import Cookies from 'js-cookie';

const KEY = 'tbc_token';

/** Matches JWT_EXPIRES_IN on the API; a cookie outliving the token is a lie. */
const COOKIE_DAYS = 7;

/** Last resort when both stores are unavailable. Dies with the tab. */
let memoryToken: string | null = null;

const readCookie = (): string | null => {
  try { return Cookies.get(KEY) || null; } catch { return null; }
};

const readLocal = (): string | null => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};

export function readToken(): string | null {
  return readCookie() || readLocal() || memoryToken;
}

/**
 * Store the token everywhere it will go.
 * @returns true when at least one store that survives a reload accepted it.
 */
export function writeToken(token: string): boolean {
  memoryToken = token;
  let persisted = false;

  try {
    Cookies.set(KEY, token, { expires: COOKIE_DAYS, sameSite: 'lax' });
    persisted = readCookie() === token;
  } catch { /* cookies blocked */ }

  try {
    localStorage.setItem(KEY, token);
    persisted = persisted || readLocal() === token;
  } catch { /* storage blocked or full */ }

  return persisted;
}

export function clearToken() {
  memoryToken = null;
  try { Cookies.remove(KEY); } catch { /* ignored */ }
  try { localStorage.removeItem(KEY); } catch { /* ignored */ }
}

/** True when the signed-in session will survive a reload. */
export function hasPersistentStore(): boolean {
  return readCookie() !== null || readLocal() !== null;
}
