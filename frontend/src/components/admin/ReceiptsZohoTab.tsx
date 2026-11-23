'use client';
// src/components/admin/ReceiptsZohoTab.tsx
//
// Super Admin -> Receipts & Zoho: who is invoiced (the per-member Zoho switch)
// and every invoice issued. The connection and go-live stay under
// Integrations -> Zoho Books.
import React, { useState } from 'react';
import Link from 'next/link';
import ZohoMembersPanel from './ZohoMembersPanel';
import ReceiptsPanel from './ReceiptsPanel';

const SUBS = [['members', 'Members'], ['receipts', 'Receipts']] as const;

export default function ReceiptsZohoTab() {
  const [sub, setSub] = useState<'members' | 'receipts'>('members');
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Choose which members are invoiced and review every receipt. Connection and go-live are in{' '}
        <Link href="/admin/super/integrations#zoho" style={{ color: 'var(--accent-blue)' }}>Integrations</Link>.
      </div>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {SUBS.map(([key, label]) => (
          <button key={key} onClick={() => setSub(key)}
            style={{
              padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: 'none', border: 'none',
              fontWeight: sub === key ? 600 : 500,
              borderBottom: sub === key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: sub === key ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>{label}</button>
        ))}
      </div>
      {sub === 'members' ? <ZohoMembersPanel /> : <ReceiptsPanel />}
    </div>
  );
}
