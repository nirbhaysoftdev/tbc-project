'use client';
// src/components/admin/CardsTab.tsx
//
// Super Admin → Card: every member's TBC membership card (last 4 digits and
// expiry only - a full number is never entered or stored), with the controls to
// assign or edit it and to switch it on or off. A disabled card is hidden from
// the member's Cards page; its details are kept for when it is enabled again.
//
// Super admin only, structurally: the page is wrapped in requireSuperAdmin and
// every endpoint behind it is too.
import { useCallback, useEffect, useState } from 'react';
import { memberCardAPI } from '@/lib/api';

type Card = { last4: string; expiryMonth: number; expiryYear: number; enabled: boolean };
type Row = { id: string; name: string; email: string; card: Card | null };

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-input, var(--bg-card))', color: 'var(--text-primary)', fontSize: 14,
};
const LABEL: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6, display: 'block',
};

const expiryText = (c: Card) => `${String(c.expiryMonth).padStart(2, '0')}/${c.expiryYear}`;

export default function CardsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(() => {
    memberCardAPI.list()
      .then(r => { setRows(r.data.members || []); setError(''); })
      .catch(() => setError('Could not load cards.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const toggle = async (r: Row) => {
    if (!r.card) return;
    setBusyId(r.id);
    try {
      await memberCardAPI.setEnabled(r.id, !r.card.enabled);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not update the card.');
    } finally { setBusyId(''); }
  };

  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : rows;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <div className="pj-error">{error}</div>}

      <input style={{ ...INPUT, maxWidth: 320 }} placeholder="Search name or email" value={search}
        onChange={e => setSearch(e.target.value)} />

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Card number</th><th>Expiry date</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>No members found.</td></tr>
            ) : shown.map(r => (
              <tr key={r.id} style={r.card && !r.card.enabled ? { opacity: 0.6 } : undefined}>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                <td>{r.email}</td>
                <td className="ltr-embed">{r.card ? `•••• •••• •••• ${r.card.last4}` : '—'}</td>
                <td className="ltr-embed">{r.card ? expiryText(r.card) : '—'}</td>
                <td>
                  {!r.card ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not assigned</span> : (
                    <span className={`badge ${r.card.enabled ? 'badge-completed' : 'badge-pending'}`}>
                      {r.card.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setEditing(r)}>
                    {r.card ? 'Update' : 'Assign'}
                  </button>
                  {r.card && (
                    <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12, marginLeft: 6 }}
                      disabled={busyId === r.id} onClick={() => toggle(r)}>
                      {r.card.enabled ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Only the last 4 digits and the expiry are stored. A disabled card is hidden from the member; its details are kept and reappear when it is enabled again.
      </p>

      {editing && <CardModal row={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CardModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [last4, setLast4] = useState(row.card?.last4 || '');
  const [month, setMonth] = useState(row.card ? String(row.card.expiryMonth) : '');
  const [year, setYear]   = useState(row.card ? String(row.card.expiryYear) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await memberCardAPI.save(row.id, { last4, expiryMonth: month, expiryYear: year });
      onDone();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not save the card.');
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#131727', border: '1px solid var(--border)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        borderRadius: 14, padding: 22, width: '100%', maxWidth: 380, display: 'grid', gap: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{row.card ? 'Update card' : 'Assign card'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{row.name} · {row.email}</p>
        </div>
        <label>
          <span style={LABEL}>Last 4 digits</span>
          <input style={INPUT} inputMode="numeric" maxLength={4} placeholder="1234" value={last4}
            onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            <span style={LABEL}>Expiry month</span>
            <input style={INPUT} inputMode="numeric" maxLength={2} placeholder="MM" value={month}
              onChange={e => setMonth(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </label>
          <label>
            <span style={LABEL}>Expiry year</span>
            <input style={INPUT} inputMode="numeric" maxLength={4} placeholder="YYYY" value={year}
              onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
        </div>
        {error && <div className="pj-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" style={{ width: 'auto', padding: '8px 18px' }} onClick={save}
            disabled={saving || last4.length !== 4 || !month || year.length !== 4}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
