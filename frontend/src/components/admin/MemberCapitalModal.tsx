'use client';
// src/components/admin/MemberCapitalModal.tsx
//
// Capital held by one member, opened from the Active Members list, and the only
// entry point into returning capital.
//
// Returning capital is the single action that reduces booked capital and moves
// money back out of a member's wallet, and it cannot be undone from the admin
// panel. It is deliberately several steps away from any listing: open the
// member's capital, open one record, reveal the restricted actions, then type a
// confirmation phrase before the button will submit.
import { useEffect, useState } from 'react';
import { investmentAPI, formatEur } from '@/lib/api';

interface Member { id: string; name: string; email: string; }

const RETURN_PHRASE = 'RETURN CAPITAL';

// Returning capital is switched off for now. The flow below is complete and
// intentionally kept - flip this to true to expose "Show restricted actions"
// again. Nothing else needs changing.
const RESTRICTED_ACTIONS_ENABLED = false;

const outstandingOf = (inv: any) => Number(inv.amount) - Number(inv.returnedAmount || 0);

export default function MemberCapitalModal({
  member, onClose, onDone,
}: {
  member: Member | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [investments, setInvestments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Step 2-3: one record open, restricted actions collapsed until asked for.
  const [recordTarget, setRecordTarget] = useState<any | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Step 4-5: the return form and its typed confirmation.
  const [returnTarget, setReturnTarget] = useState<any | null>(null);
  const [returnAmount, setReturnAmount] = useState('');
  const [returnConfirm, setReturnConfirm] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returning, setReturning] = useState(false);

  const load = () => {
    if (!member) return Promise.resolve();
    setLoading(true);
    return investmentAPI.listInvestments({ userId: member.id })
      .then(r => setInvestments(r.data.investments || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setRecordTarget(null);
    setAdvancedOpen(false);
    setReturnTarget(null);
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [member?.id]);

  if (!member) return null;

  const statusBadgeClass = (status: string) =>
    status === 'ACTIVE' || status === 'COMPLETED' ? 'badge-completed' :
    status === 'PENDING' ? 'badge-pending' : 'badge-failed';

  const totalOutstanding = investments
    .filter((i: any) => i.status === 'ACTIVE')
    .reduce((sum: number, i: any) => sum + outstandingOf(i), 0);

  return (
    <>
      {/* ── Step 1: the member's capital records ── */}
      {!recordTarget && !returnTarget && (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <p className="modal-title">Capital — {member.name}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
              {formatEur(totalOutstanding)} outstanding across {investments.length} record
              {investments.length === 1 ? '' : 's'}. Open a record to see its details.
            </p>

            <div className="tx-table-wrap" style={{ marginBottom:4 }}>
              <table className="tx-table">
                <thead>
                  <tr><th>Project</th><th>Booked</th><th>Outstanding</th><th>Invested</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {investments.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>
                      {loading ? 'Loading…' : 'No capital booked for this member.'}
                    </td></tr>
                  ) : investments.map((inv: any) => (
                    <tr key={inv.id} onClick={() => { setRecordTarget(inv); setAdvancedOpen(false); }}
                        style={{ cursor:'pointer' }} title="Open this record">
                      <td>{inv.project?.title || <span style={{ color:'var(--text-muted)' }}>No project</span>}</td>
                      <td>{formatEur(inv.amount)}</td>
                      <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{formatEur(outstandingOf(inv))}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:12 }}>{new Date(inv.investedAt).toLocaleDateString()}</td>
                      <td><span className={`badge ${statusBadgeClass(inv.status)}`}>{inv.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: one record, read-only ── */}
      {recordTarget && (
        <div className="modal-overlay" onClick={() => setRecordTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <p className="modal-title">Investment Record</p>
            <div style={{ fontSize:13, display:'grid', gap:8, marginBottom:16 }}>
              {[
                ['Member',           member.name],
                ['Email',            member.email],
                ['Project',          recordTarget.project?.title || 'No project'],
                ['Capital booked',   formatEur(recordTarget.amount)],
                ['Capital returned', formatEur(recordTarget.returnedAmount || 0)],
                ['Outstanding',      formatEur(outstandingOf(recordTarget))],
                ['Invested on',      new Date(recordTarget.investedAt).toLocaleDateString()],
                ['Status',           recordTarget.status],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ display:'flex', justifyContent:'space-between', gap:16 }}>
                  <span style={{ color:'var(--text-muted)' }}>{label}</span>
                  <span style={{ color:'var(--text-primary)', fontWeight:600, textAlign:'right' }}>{value || '-'}</span>
                </div>
              ))}
            </div>

            {/* ── Step 3: restricted actions stay collapsed ── */}
            {RESTRICTED_ACTIONS_ENABLED && recordTarget.status === 'ACTIVE' && outstandingOf(recordTarget) > 0 && (
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
                {!advancedOpen ? (
                  <button type="button"
                    style={{ background:'none', border:'none', padding:0, fontSize:12, cursor:'pointer', color:'var(--text-muted)', textDecoration:'underline' }}
                    onClick={() => setAdvancedOpen(true)}>
                    Show restricted actions
                  </button>
                ) : (
                  <div style={{ border:'1px solid var(--red)', borderRadius:6, padding:12, background:'rgba(224,82,82,0.06)' }}>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--red)', marginBottom:6 }}>RESTRICTED</p>
                    <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
                      Returning capital permanently reduces this member&apos;s booked capital and moves
                      money out of their wallet. It cannot be undone from the admin panel.
                    </p>
                    {/* ── Step 4: open the return form ── */}
                    <button type="button" className="btn-secondary"
                      style={{ width:'auto', padding:'6px 14px', fontSize:12 }}
                      onClick={() => {
                        setReturnTarget(recordTarget);
                        setReturnAmount('');
                        setReturnConfirm('');
                        setReturnError('');
                        setRecordTarget(null);
                      }}>
                      Return capital…
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setRecordTarget(null)}>Back</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: amount plus a typed confirmation ── */}
      {returnTarget && (
        <div className="modal-overlay" onClick={() => setReturnTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <p className="modal-title">Return Capital</p>
            <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14 }}>
              Returning capital to <strong style={{ color:'var(--text-primary)' }}>{member.name}</strong> from{' '}
              <strong style={{ color:'var(--text-primary)' }}>{returnTarget.project?.title || 'their general investment'}</strong>.
              Outstanding capital on this record is {formatEur(outstandingOf(returnTarget))}. Profit
              already paid is not affected.
            </p>
            <div className="form-group">
              <label className="form-label">AMOUNT TO RETURN (€)</label>
              <input className="form-input" type="number" min="0.01" step="0.01"
                placeholder="Leave empty to return the full outstanding amount"
                value={returnAmount} onChange={e => setReturnAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">TYPE &quot;{RETURN_PHRASE}&quot; TO CONFIRM</label>
              <input className="form-input" type="text" autoComplete="off"
                placeholder={RETURN_PHRASE}
                value={returnConfirm} onChange={e => setReturnConfirm(e.target.value)} />
            </div>
            {returnError && <p className="form-error">{returnError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" disabled={returning}
                onClick={() => setReturnTarget(null)}>Cancel</button>
              <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
                disabled={returning || returnConfirm.trim().toUpperCase() !== RETURN_PHRASE}
                onClick={async () => {
                  setReturning(true);
                  setReturnError('');
                  try {
                    await investmentAPI.returnCapital(returnTarget.id, returnAmount ? { amount: returnAmount } : {});
                    setReturnTarget(null);
                    await load();
                    onDone?.();
                  } catch (err: any) {
                    setReturnError(err.response?.data?.error || 'Could not return capital');
                  } finally {
                    setReturning(false);
                  }
                }}>
                {returning ? 'Working…' : 'Return Capital'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
