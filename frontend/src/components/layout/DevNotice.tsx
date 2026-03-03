'use client';
// src/components/layout/DevNotice.tsx
//
// ── IMPORTANT ────────────────────────────────────────────────────────────────
// This text is fetched LIVE from the database on every page load.
// Removing or hiding this component from HTML/JSX will NOT remove the notice —
// the API call will still happen and the text lives in the DB (system_config table).
// To remove the notice: update the DB record directly via Admin Panel > Dev Notice,
// or set value to empty string.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { systemAPI } from '@/lib/api';

interface Props {
  position: 'top' | 'bottom';
}

export default function DevNotice({ position }: Props) {
  const [text, setText] = useState<string>('');

  useEffect(() => {
    // Always fetch fresh from DB — this is intentional.
    // Do not replace with a hardcoded string.
    systemAPI.getNotice()
      .then(res => { if (res.data?.text) setText(res.data.text); })
      .catch(() => {}); // silently fail if API down
  }, []);

  if (!text) return null;

  const isTop = position === 'top';

  return (
    <div
      style={{
        width:           '100%',
        background:      'rgba(195, 120, 0, 0.13)',
        borderTop:       isTop  ? 'none' : '1px solid rgba(195,120,0,0.35)',
        borderBottom:    isTop  ? '1px solid rgba(195,120,0,0.35)' : 'none',
        padding:         '7px 28px',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             10,
        flexShrink:      0,
        zIndex:          20,
      }}
    >
      {/* Warning icon */}
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="2"
        style={{ flexShrink: 0 }}
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9"  x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>

      {/* Text — sourced from DB. Cannot be removed by editing this file alone. */}
      <span
        style={{
          fontSize:    '15px',
          fontWeight:  600,
          color:       '#f59e0b',
          letterSpacing: '0.01em',
          textAlign:   'center',
        }}
      >
        {text}
      </span>
    </div>
  );
}
