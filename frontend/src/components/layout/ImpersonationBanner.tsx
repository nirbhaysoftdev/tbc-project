'use client';
// src/components/layout/ImpersonationBanner.tsx
//
// A fixed bar across the top of every page while a super admin is viewing the
// portal as someone else.
//
// It has to be impossible to miss. The failure it prevents is an operator who
// forgets, reads the member's wallet or messages as if it were their own view
// of the system, and reports what they saw as fact. The API refuses every write
// made with an impersonation token, so the risk here is misreading rather than
// damage — but a misread balance is still a wrong answer given to a member.
//
// The token is read locally only to decide whether to ask; the answer always
// comes from the API. The grant dies with the grantor's authority — a demoted
// or deleted super admin's outstanding tokens stop working at once — and only
// the server knows that.

import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { superAdminAPI } from '@/lib/api';

/**
 * Does the stored credential even claim to be an impersonation?
 *
 * Read straight out of the JWT payload, unverified, purely to decide whether
 * to ask the server. Trusting this claim would be a hole; using it to skip a
 * request is not, because a forged `impersonatedBy` only makes the browser ask
 * a question the server then answers honestly. Without this check every page
 * load for every member would carry an extra request to learn "no".
 */
function tokenClaimsImpersonation(): boolean {
  try {
    const token = Cookies.get('tbc_token') || localStorage.getItem('tbc_token');
    if (!token) return false;
    const payload = token.split('.')[1];
    if (!payload) return false;
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    );
    return Boolean(json?.impersonatedBy);
  } catch {
    // Malformed token, or storage blocked. Nothing to show.
    return false;
  }
}

export default function ImpersonationBanner() {
  const [state, setState] = useState<{ by: string | null; name: string } | null>(null);

  useEffect(() => {
    if (!tokenClaimsImpersonation()) return;

    let cancelled = false;
    superAdminAPI.impersonationStatus()
      .then((res) => {
        if (cancelled || !res.data?.impersonating) return;
        setState({ by: res.data.by, name: res.data.user?.name || 'this member' });
      })
      // A stale or rejected token, or the API briefly unreachable, simply
      // means no banner.
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!state) return null;

  const end = () => {
    // The impersonation token is the only credential in storage at this point,
    // so ending the session means signing back in as yourself. Clearing it
    // here rather than restoring a saved one is deliberate: keeping a second
    // live token around to swap back to is a worse thing to own.
    try {
      localStorage.removeItem('tbc_token');
      document.cookie = 'tbc_token=; Max-Age=0; path=/';
    } catch { /* storage blocked; the redirect still applies */ }
    window.location.href = '/login';
  };

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 14, flexWrap: 'wrap',
        padding: '8px 16px',
        background: 'repeating-linear-gradient(45deg, #b4441f 0 12px, #9c3a1a 12px 24px)',
        color: '#fff', fontSize: 13, fontWeight: 600,
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
      }}
    >
      <span>
        Viewing as <strong>{state.name}</strong> — read-only. Every change is refused.
      </span>
      <button
        onClick={end}
        style={{
          padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          borderRadius: 6, border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(0,0,0,0.25)', color: '#fff',
        }}
      >
        End session
      </button>
    </div>
  );
}
