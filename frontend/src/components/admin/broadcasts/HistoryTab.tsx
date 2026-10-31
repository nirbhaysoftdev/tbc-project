'use client';
// src/components/admin/broadcasts/HistoryTab.tsx
//
// Every broadcast that has been sent, newest first, with the counts each row
// needs to answer "did this actually go out?" - never the recipient
// addresses themselves, which the API deliberately never returns in this
// list (see emailBroadcastController.shapeBroadcast).
import React, { useCallback, useEffect, useState } from 'react';
import { broadcastsAPI, formatDateTime } from '@/lib/api';

type Broadcast = {
  id: string;
  subject: string;
  heading: string;
  createdAt: string;
  adminName?: string | null;
  admin?: { name: string } | null;
  audienceSelection: { mode: 'ALL' | 'INCLUDE' | 'EXCLUDE'; audienceSize: number; selectedCount: number; label: string | null };
  email: { state: string; recipients: number; accepted: number; failed: number; pending: number; failures: string[]; canRetry: boolean };
};

const STATE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:    { color: '#8c9ab5', bg: 'rgba(140,154,181,0.12)', label: 'Pending' },
  PROCESSING: { color: '#7fb0ff', bg: 'rgba(58,111,255,0.12)',  label: 'Sending…' },
  COMPLETED:  { color: '#4cd98a', bg: 'rgba(76,217,138,0.12)',  label: 'Completed' },
  PARTIAL:    { color: '#ffbe32', bg: 'rgba(255,190,50,0.12)',  label: 'Partially delivered' },
  FAILED:     { color: '#e05252', bg: 'rgba(224,82,82,0.12)',   label: 'Failed' },
};

export default function HistoryTab({ refreshToken }: { refreshToken: number }) {
  const [rows, setRows] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    broadcastsAPI.list({ limit: '50' })
      .then((res) => { setRows(res.data.broadcasts || []); setError(''); })
      .catch((err) => setError(err?.response?.data?.error || 'Could not load the broadcast history.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshToken]);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await broadcastsAPI.retry(id);
      load();
    } catch {
      // The row keeps its own "canRetry" state, which load() refreshes.
    } finally {
      setRetrying(null);
    }
  };

  if (loading) return <div className="pj-hint">Loading…</div>;
  if (error) return <div className="pj-error">{error}</div>;
  if (!rows.length) return <div className="pj-hint">No broadcasts have been sent yet.</div>;

  return (
    <div className="bc-history">
      <table className="bc-history-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Sent to</th>
            <th>Recipients</th>
            <th>Status</th>
            <th>By</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = STATE_STYLE[row.email.state] || STATE_STYLE.PENDING;
            const isOpen = expanded === row.id;
            return (
              <React.Fragment key={row.id}>
                <tr className="bc-history-row" onClick={() => setExpanded(isOpen ? null : row.id)}>
                  <td className="bc-history-subject">
                    <div>{row.subject}</div>
                    <div className="pj-hint">{row.heading}</div>
                  </td>
                  <td>
                    {row.audienceSelection.mode === 'ALL'
                      ? `Everyone (${row.audienceSelection.audienceSize})`
                      : `${row.audienceSelection.label} of ${row.audienceSelection.audienceSize}`}
                  </td>
                  <td>{row.email.recipients}</td>
                  <td>
                    <span className="bc-badge" style={{ color: state.color, background: state.bg }}>
                      {state.label}
                    </span>
                  </td>
                  <td>{row.admin?.name || row.adminName || '—'}</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                </tr>
                {isOpen && (
                  <tr className="bc-history-detail-row">
                    <td colSpan={6}>
                      <div className="bc-history-detail">
                        <span>Accepted: <strong>{row.email.accepted}</strong></span>
                        <span>Pending: <strong>{row.email.pending}</strong></span>
                        <span>Failed: <strong>{row.email.failed}</strong></span>
                        {row.email.failures.length > 0 && (
                          <div className="pj-hint">
                            {row.email.failures.map((f, i) => <div key={i}>{f}</div>)}
                          </div>
                        )}
                        {row.email.canRetry && (
                          <button type="button" className="pj-btn pj-btn-sm"
                            disabled={retrying === row.id}
                            onClick={(e) => { e.stopPropagation(); retry(row.id); }}>
                            {retrying === row.id ? 'Retrying…' : 'Retry failed'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
