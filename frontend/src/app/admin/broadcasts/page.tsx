'use client';
// src/app/admin/broadcasts/page.tsx
//
// Email Communication: write a broadcast email, preview it, choose who gets
// it (select or exclude members), send, and review the delivery history.
//
// Its own route rather than a hash-tab inside /admin, matching Activity Logs
// and Withdrawal Requests - this is a distinct enough job (composing and
// sending mail) that it earns its own sidebar row and page, the way those
// two do, rather than crowding the /admin tab bar.
import { useState } from 'react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import ComposeTab from '@/components/admin/broadcasts/ComposeTab';
import HistoryTab from '@/components/admin/broadcasts/HistoryTab';
import '@/styles/projects.css';
import '@/styles/broadcasts.css';

function BroadcastsContent() {
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  // Bumped after a successful send, so switching to History always shows the
  // broadcast that was just queued rather than a stale list.
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">Email Communication</h1>
      </div>

      <div className="bc-tabs">
        <button type="button" className={`bc-tab${tab === 'compose' ? ' active' : ''}`}
          onClick={() => setTab('compose')}>
          Compose
        </button>
        <button type="button" className={`bc-tab${tab === 'history' ? ' active' : ''}`}
          onClick={() => setTab('history')}>
          History
        </button>
      </div>

      {tab === 'compose'
        ? <ComposeTab onSent={() => { setRefreshToken((n) => n + 1); setTab('history'); }} />
        : <HistoryTab refreshToken={refreshToken} />}
    </div>
  );
}

export default function BroadcastsPage() {
  return (
    <ProtectedLayout requireAdmin>
      <BroadcastsContent />
    </ProtectedLayout>
  );
}
