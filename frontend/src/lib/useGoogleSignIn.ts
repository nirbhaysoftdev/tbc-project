'use client';
// src/lib/useGoogleSignIn.ts
// Lightweight vanilla Google Identity Services loader — no npm dep required.
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: any;
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google script failed to load'));
    document.head.appendChild(s);
  });
}

export function useGoogleSignIn(onCredential: (credential: string) => void) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setUnavailable(true);
      return;
    }
    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: any) => {
            if (resp?.credential) onCredential(resp.credential);
          },
          auto_select: false,
          use_fedcm_for_prompt: true,
        });
        if (buttonRef.current) {
          window.google.accounts.id.renderButton(buttonRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            width: 360,
          });
        }
        setReady(true);
      })
      .catch(() => setUnavailable(true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { buttonRef, ready, unavailable };
}
