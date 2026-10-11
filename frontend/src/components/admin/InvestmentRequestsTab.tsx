'use client';
// src/components/admin/InvestmentRequestsTab.tsx
//
// Admin workflow for member investment requests:
//   Review Request -> Confirm Payment Received -> Enter Actual Amount -> Complete
//
// Completing is the only step that creates money. The requested amount and the
// actual amount received are tracked separately, and everything downstream uses
// the actual amount.
import { useEffect, useState } from 'react';
import { investmentRequestAPI, formatEur } from '@/lib/api';

type Status = 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Payment received',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const statusBadgeClass = (status: Status) =>
  status === 'COMPLETED' ? 'badge-completed'
  : status === 'PENDING' || status === 'APPROVED' ? 'badge-pending'
  : 'badge-failed';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function InvestmentRequestsTab({ onCompleted }: { onCompleted?: () => void }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [actualAmount, setActualAmount] = useState('');
  const [investedAt, setInvestedAt] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    return investmentRequestAPI
      .list(statusFilter ? { status: statusFilter } : undefined)
      .then(r => setRequests(r.data.requests || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const openRequest = async (request: any) => {
    setActive(request);
    setDetail(null);
    setError('');
    setActualAmount(String(request.actualAmount ?? request.requestedAmount ?? ''));
    setInvestedAt(todayIso());
    try {
      const res = await investmentRequestAPI.getOne(request.id);
      setDetail(res.data);
    } catch {
      setError('Could not load the full request details.');
    }
  };

  const close = () => { setActive(null); setDetail(null); setError(''); };

  const run = async (fn: () => Promise<any>, after: 'close' | 'refresh') => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      if (after === 'close') { close(); onCompleted?.(); }
      else if (active) {
        const res = await investmentRequestAPI.getOne(active.id);
        setDetail(res.data);
        setActive(res.data.request);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const amountNum = parseFloat(actualAmount) || 0;
  const shortfall = active ? (active.requestedAmount || 0) - amountNum : 0;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <p style={{ fontSize:12, color:'var(--text-muted)' }}>
          Members request an investment here; the money is transferred offline. Nothing reaches a wallet
          until you confirm payment and complete the request with the actual amount received.
        </p>
        <select className="filter-select" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as Status | '')}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as Status[]).map(s => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Member</th><th>Project</th><th>Requested</th><th>Actual</th>
              <th>Request Date</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                {loading ? 'Loading…' : 'No investment requests yet.'}
              </td></tr>
            ) : requests.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight:600, color:'var(--text-primary)' }}>
                  {r.user?.name}
                  <span style={{ display:'block', fontSize:11, color:'var(--text-muted)', fontWeight:400 }}>{r.user?.email}</span>
                </td>
                <td>{r.project?.title}</td>
                <td>{formatEur(r.requestedAmount)}</td>
                <td>{r.actualAmount != null ? formatEur(r.actualAmount) : <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
                <td style={{ color:'var(--text-muted)', fontSize:12 }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td><span className={`badge ${statusBadgeClass(r.status)}`}>{STATUS_LABEL[r.status as Status]}</span></td>
                <td>
                  <button className="btn-secondary" style={{ width:'auto', padding:'5px 12px', fontSize:12 }}
                    onClick={() => openRequest(r)}>
                    {r.status === 'COMPLETED' || r.status === 'REJECTED' || r.status === 'CANCELLED' ? 'View' : 'Review'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <p className="modal-title">Investment Request</p>

            <div style={{
              background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)', padding:'14px 16px', fontSize:13,
              color:'var(--text-secondary)', display:'flex', flexDirection:'column', gap:8,
            }}>
              <div><strong style={{ color:'var(--text-primary)' }}>Member:</strong> {active.user?.name} ({active.user?.email})</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Project:</strong> {active.project?.title}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Requested Amount:</strong> {formatEur(active.requestedAmount)}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Request Date:</strong> {new Date(active.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Status:</strong> {STATUS_LABEL[active.status as Status]}</div>
              {active.message && <div><strong style={{ color:'var(--text-primary)' }}>Note:</strong> {active.message}</div>}
            </div>

            {detail && (
              <div style={{
                background:'rgba(200,168,75,0.08)', border:'1px solid rgba(200,168,75,0.25)',
                borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:12,
                color:'var(--text-secondary)', marginTop:12,
              }}>
                <div><strong style={{ color:'var(--text-primary)' }}>Current capital in this project:</strong> {formatEur(detail.projectCapital)}</div>
                <div><strong style={{ color:'var(--text-primary)' }}>Wallet invested capital:</strong> {formatEur(detail.wallet?.investedCapital)}</div>
                <div><strong style={{ color:'var(--text-primary)' }}>Wallet available profit:</strong> {formatEur(detail.wallet?.availableProfit)}</div>
                <div>
                  <strong style={{ color:'var(--text-primary)' }}>Profit configuration:</strong>{' '}
                  {detail.monthlyConfig ? `${detail.monthlyConfig.rate}% monthly` : 'none set yet'}
                </div>
                {active.status !== 'COMPLETED' && amountNum > 0 && (
                  <div style={{ marginTop:6, paddingTop:6, borderTop:'1px solid rgba(200,168,75,0.25)' }}>
                    <strong style={{ color:'var(--text-primary)' }}>Wallet impact:</strong>{' '}
                    capital {formatEur(detail.wallet?.investedCapital)} → {formatEur((detail.wallet?.investedCapital || 0) + amountNum)}
                  </div>
                )}
              </div>
            )}

            {(active.status === 'PENDING' || active.status === 'APPROVED') && (
              <>
                <div className="form-group" style={{ marginTop:14 }}>
                  <label className="form-label">ACTUAL AMOUNT RECEIVED (€) *</label>
                  <input className="form-input" type="number" min="0.01" step="0.01"
                    value={actualAmount} onChange={e => setActualAmount(e.target.value)} />
                  {shortfall > 0 && amountNum > 0 && (
                    <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:6 }}>
                      {formatEur(shortfall)} less than requested. All future capital and profit
                      calculations will use {formatEur(amountNum)}.
                    </p>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">INVESTMENT DATE *</label>
                  <input className="form-input" type="date"
                    value={investedAt} onChange={e => setInvestedAt(e.target.value)} />
                </div>
              </>
            )}

            {error && <p className="form-error" style={{ marginTop:10 }}>{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={close} disabled={busy}>Close</button>

              {active.status === 'PENDING' && (
                <>
                  <button type="button" className="btn-secondary" disabled={busy}
                    onClick={() => run(() => investmentRequestAPI.reject(active.id), 'close')}>
                    Reject
                  </button>
                  <button type="button" className="btn-secondary" disabled={busy}
                    onClick={() => run(() => investmentRequestAPI.paymentReceived(active.id), 'refresh')}>
                    Confirm Payment Received
                  </button>
                </>
              )}

              {(active.status === 'PENDING' || active.status === 'APPROVED') && (
                <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
                  disabled={busy || amountNum <= 0}
                  onClick={() => run(
                    () => investmentRequestAPI.complete(active.id, { actualAmount, investedAt }),
                    'close',
                  )}>
                  {busy ? 'Working…' : 'Complete Investment'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
