// src/lib/tracker.ts
//
// The browser half of traffic analytics: who is on which page, right now.
//
// WHAT IT SENDS, and nothing else: a random visitor id this browser made for
// itself, a random id for this tab's visit, the path (no query string - the
// server drops it too), the referrer on the first page, and the session token
// if one exists, so the server can say "this visit belongs to member X".
//
// WHAT IT RESPECTS: Do-Not-Track and Global Privacy Control switch it off
// entirely - nothing is sent, nothing is stored. The server enforces the same
// rule, so a modified client cannot opt a browser back in.
//
// Every storage and network call is guarded. Tracking is a convenience of the
// admin's; it must never be the reason a page fails to load.
import { readToken } from '@/lib/tokenStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const VISITOR_KEY = 'tbc_vid';
const SESSION_KEY = 'tbc_sid';
export const BEAT_MS = 30_000;

const rand = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
};

// Used when storage is blocked: one id per page load is still a usable session.
let memoryVisitor: string | null = null;
let memorySession: string | null = null;

function stored(store: 'local' | 'session', key: string, memory: () => string | null, set: (v: string) => void): string {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage;
    let v = s.getItem(key);
    if (!v) { v = rand(); s.setItem(key, v); }
    return v;
  } catch {
    const m = memory();
    if (m) return m;
    const v = rand(); set(v); return v;
  }
}

export const visitorId = () => stored('local', VISITOR_KEY, () => memoryVisitor, (v) => { memoryVisitor = v; });
export const sessionId = () => stored('session', SESSION_KEY, () => memorySession, (v) => { memorySession = v; });

/** After logout the next page is a new visit, so the signed-in one is closed off cleanly. */
export function resetSession() {
  memorySession = null;
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* nothing to clear */ }
  started = false;
}

export function trackingAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const nav: any = navigator;
  return !(nav.doNotTrack === '1' || (window as any).doNotTrack === '1' || nav.globalPrivacyControl === true);
}

/** Headers the API client adds so a login can be tied to the visit it happened in. */
export function analyticsHeaders(): Record<string, string> {
  if (!trackingAllowed()) return {};
  return { 'X-Analytics-Session': sessionId(), 'X-Analytics-Visitor': visitorId() };
}

let started = false;

function payload(kind: 'view' | 'beat' | 'end', path: string) {
  return {
    kind, path,
    sessionId: sessionId(), visitorId: visitorId(),
    // Only meaningful on the first page of a visit; the server ignores it after.
    ...(kind === 'view' && !started ? { referrer: document.referrer || undefined, utm: new URLSearchParams(window.location.search).get('utm_source') || undefined } : {}),
  };
}

export function sendBeat(kind: 'view' | 'beat' | 'end', path: string) {
  if (!trackingAllowed()) return;
  const body = JSON.stringify(payload(kind, path));
  if (kind === 'view') started = true;
  try {
    if (kind === 'end' && navigator.sendBeacon) {
      // The only request that survives a closing tab. It cannot carry an
      // Authorization header, which is fine: the session already knows its user.
      navigator.sendBeacon(`${API_URL}/track`, new Blob([body], { type: 'text/plain' }));
      return;
    }
    const token = readToken();
    fetch(`${API_URL}/track`, {
      method: 'POST', body, keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }).catch(() => { /* a tracker never reports its own failure */ });
  } catch { /* same */ }
}
