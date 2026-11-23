'use client';
// src/components/admin/ZohoSwitch.tsx
//
// One control for "is this member in Zoho Books", used on the member page and in
// the Zoho Books member list so both read the same. The colour is never the only
// signal: the dot sits beside a word, and the track carries role="switch".
import React from 'react';

export function ZohoDot({ on, size = 9 }: { on: boolean; size?: number }) {
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
      background: on ? '#2ecc71' : '#e05252',
      boxShadow: `0 0 0 3px ${on ? 'rgba(46,204,113,0.18)' : 'rgba(224,82,82,0.18)'}`,
    }} />
  );
}

interface Props {
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
  label?: boolean;      // show "Zoho on / Zoho off" beside the track
  title?: string;
}

export default function ZohoSwitch({ on, busy, onToggle, label = true, title }: Props) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={busy} title={title} onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 12px 6px 8px',
        borderRadius: 99, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        border: `1px solid ${on ? 'rgba(46,204,113,0.35)' : 'rgba(224,82,82,0.35)'}`,
        background: on ? 'rgba(46,204,113,0.08)' : 'rgba(224,82,82,0.08)',
        color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, fontWeight: 600,
        transition: 'background .15s, border-color .15s',
      }}>
      <span style={{
        position: 'relative', width: 34, height: 20, borderRadius: 99, flexShrink: 0,
        background: on ? '#2ecc71' : '#e05252', transition: 'background .15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.35)', transition: 'left .15s',
        }} />
      </span>
      {label && <span>{on ? 'Zoho on' : 'Zoho off'}</span>}
    </button>
  );
}
