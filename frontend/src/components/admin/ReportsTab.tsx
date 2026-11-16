'use client';
// src/components/admin/ReportsTab.tsx
//
// Super Admin → Reports: pick a report, preview it, download it as CSV, and set
// the address that receives the members' report on the 7th of every month.
//
// Super admin only, structurally: the page is wrapped in requireSuperAdmin and
// every endpoint behind it is too. These tables carry every member's email and
// balance.
import React, { useCallback, useEffect, useState } from 'react';
import { reportsAPI, formatEur, formatNumber, downloadBlob, formatDateTime } from '@/lib/api';
import '@/styles/projects.css';

interface Col { label: string; type?: 'eur' | 'pct' | 'date' | 'int' }
interface Report { key: string; title: string; columns: Col[]; rows: any[][]; totals?: Record<string, number> }
interface Entry { key: string; title: string; description: string; ranged?: boolean }
interface Setting { emails: string[]; source: 'config' | 'default'; updatedAt: string | null; max: number; fallback: string; reportDay: number }

const CARD: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 18,
};
const LABEL: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6,
};
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const show = (v: any, c: Col) => {
  if (v == null || v === '') return '—';
  if (c.type === 'eur') return formatEur(Number(v));
  if (c.type === 'pct') return `${formatNumber(Number(v))}%`;
  return String(v);
};
const isNum = (c: Col) => c.type === 'eur' || c.type === 'pct' || c.type === 'int';

export default function ReportsTab() {
  const [catalogue, setCatalogue] = useState<Entry[]>([]);
  const [active, setActive] = useState('members-financials');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [setting, setSetting] = useState<Setting | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const entry = catalogue.find((c) => c.key === active);
  const params = useCallback((): Record<string, string> => {
    const p: Record<string, string> = {};
    if (entry?.ranged) { if (from) p.from = from; if (to) p.to = to; }
    return p;
  }, [entry, from, to]);

  const loadSettings = useCallback(() => {
    reportsAPI.getSettings()
      .then((r) => { setSetting(r.data); setEmails(r.data.emails || []); setDraft(''); })
      .catch(() => setError('Could not load the report recipients.'));
  }, []);

  useEffect(() => {
    reportsAPI.catalogue().then((r) => setCatalogue(r.data.reports || [])).catch(() => setError('Could not load the reports.'));
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!entry) return;
    setLoading(true); setError('');
    reportsAPI.run(active, params())
      .then((r) => setReport(r.data))
      .catch((e) => { setReport(null); setError(e?.response?.data?.error || 'Could not build this report.'); })
      .finally(() => setLoading(false));
  // Re-run when the report or its dates change.
  }, [active, entry, params]);

  const download = async () => {
    try {
      const r = await reportsAPI.download(active, params());
      downloadBlob(r.data, `${active}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch { setError('Could not download the report.'); }
  };

  const addDraft = (): string[] => {
    const parts = draft.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);
    if (parts.length === 0) return emails;
    const bad = parts.filter((p) => !isEmail(p));
    if (bad.length) { setError(`Not valid email addresses: ${bad.join(', ')}`); return emails; }
    const next = [...emails];
    for (const p of parts) if (!next.some((e) => e.toLowerCase() === p.toLowerCase()) && next.length < (setting?.max ?? 10)) next.push(p);
    setError(''); setEmails(next); setDraft('');
    return next;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const next = addDraft();
    if (draft.trim() && !isEmail(draft.trim())) return;
    if (next.length === 0) { setError('Add at least one address.'); return; }
    setSaving(true); setNotice('');
    try {
      const res = await reportsAPI.updateSettings(next);
      setNotice(res.data.unchanged ? 'Nothing changed.' : `The monthly report will be emailed to ${res.data.emails.join(', ')}.`);
      loadSettings();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save the recipients.');
    } finally { setSaving(false); }
  };

  const sendNow = async () => {
    if (!window.confirm(`Email the members report now to ${setting?.emails.join(', ')}? It contains every member's balance.`)) return;
    setSending(true); setError(''); setNotice('');
    try {
      const r = await reportsAPI.sendNow();
      setNotice(`Report sent to ${r.data.recipients.join(', ')}.`);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not send the report.');
    } finally { setSending(false); }
  };

  const dirty = setting
    ? draft.trim().length > 0 || emails.length !== setting.emails.length
      || emails.some((e, i) => e.toLowerCase() !== (setting.emails[i] || '').toLowerCase())
    : false;
  const nobody = setting?.source === 'default' && setting.emails.length === 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {(notice || error) && (
        <div className={error ? 'pj-error' : 'pj-ok'}>{error || notice}</div>
      )}

      {/* ── Monthly email ── */}
      <div style={{ ...CARD, maxWidth: 760 }}>
        <div style={LABEL}>Monthly members report</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 14px' }}>
          On the {setting?.reportDay ?? 7}th of every month this email lists every member’s
          investment, profit, balance and monthly fix %, and which credits are due next with their
          amounts. The full lists are attached as CSV.
        </p>
        {nobody && <div className="pj-error" style={{ marginBottom: 12 }}>No address is set, so the report is not being sent.</div>}
        <form onSubmit={save}>
          {emails.length > 0 && (
            <div className="pj-picker-selected" style={{ marginTop: 0, marginBottom: 10 }}>
              {emails.map((em) => (
                <span className="pj-token" key={em}>
                  <span>{em}</span>
                  <button type="button" aria-label={`Remove ${em}`} disabled={saving}
                    onClick={() => setEmails(emails.filter((x) => x !== em))}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <input className="pj-input" type="email" value={draft} disabled={saving}
                onChange={(e) => { setDraft(e.target.value); setError(''); setNotice(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addDraft(); } }}
                onBlur={() => { if (draft.trim()) addDraft(); }}
                placeholder="reports@example.com — Enter to add another"
                aria-label="Monthly report recipient email address" />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.6 }}>
                {setting?.source === 'config'
                  ? <>Last changed {setting.updatedAt ? formatDateTime(setting.updatedAt) : ''}. The change is recorded in Logs.</>
                  : setting?.fallback
                    ? <>Using the server’s PROFIT_REPORT_EMAIL (<strong>{setting.fallback}</strong>) until a list is saved here.</>
                    : <>Nothing is configured.</>}
              </div>
            </div>
            <button type="submit" className="pj-btn pj-btn-primary" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="pj-btn" onClick={sendNow}
              disabled={sending || !setting || setting.emails.length === 0 || dirty}>
              {sending ? 'Sending…' : 'Send now'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Reports ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {catalogue.map((c) => (
          <button key={c.key} onClick={() => setActive(c.key)} className={`pj-btn${active === c.key ? ' pj-btn-primary' : ''}`}>
            {c.title}
          </button>
        ))}
      </div>

      <div style={CARD}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{report?.title || entry?.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{entry?.description}</div>
          </div>
          {entry?.ranged && (
            <>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From{' '}
                <input type="date" className="pj-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To{' '}
                <input type="date" className="pj-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
              </label>
            </>
          )}
          <button className="pj-btn pj-btn-primary" onClick={download} disabled={loading || !report}>Download CSV</button>
        </div>

        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>{report?.columns.map((c) => <th key={c.label} style={isNum(c) ? { textAlign: 'right' } : undefined}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={report?.columns.length || 1} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : !report || report.rows.length === 0 ? (
                <tr><td colSpan={report?.columns.length || 1} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Nothing to report.</td></tr>
              ) : (
                <>
                  {report.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j} className={isNum(report.columns[j]) ? 'ltr-embed' : undefined}
                          style={isNum(report.columns[j]) ? { textAlign: 'right' } : undefined}>
                          {show(v, report.columns[j])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {report.totals && (
                    <tr style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {report.columns.map((c, j) => (
                        <td key={j} className="ltr-embed" style={isNum(c) ? { textAlign: 'right' } : undefined}>
                          {j === 0 ? `Total (${report.rows.length})` : report.totals![j] != null ? show(report.totals![j], c) : ''}
                        </td>
                      ))}
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
