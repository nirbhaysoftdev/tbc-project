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
import { investmentAPI, formatEur, formatDate } from '@/lib/api';
import { Trans, useTranslation } from 'react-i18next';

interface Member { id: string; name: string; email: string; }

// The typed confirmation phrase is TRANSLATED, and the comparison below uses
// the same translated value — an Italian admin types the Italian phrase. A
// safety gate the operator cannot read is not a safety gate.


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
  const { t } = useTranslation(['admin', 'common']);
  // Uppercased so the comparison is case-insensitive in every language.
  const returnPhrase = t('admin:capitalModal.confirmPhrase').toUpperCase();
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
            <p className="modal-title">{t('admin:capitalModal.title', { name: member.name })}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14 }}>
              {t('admin:capitalModal.outstandingSummary', {
                amount: formatEur(totalOutstanding),
                count: investments.length,
              })}
            </p>

            <div className="tx-table-wrap" style={{ marginBottom:4 }}>
              <table className="tx-table">
                <thead>
                  <tr>
                    <th>{t('admin:capitalModal.cols.project')}</th>
                    <th>{t('admin:capitalModal.cols.booked')}</th>
                    <th>{t('admin:capitalModal.cols.outstanding')}</th>
                    <th>{t('admin:capitalModal.cols.invested')}</th>
                    <th>{t('admin:capitalModal.cols.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:24, color:'var(--text-muted)' }}>
                      {loading ? t('common:state.loading') : t('admin:capitalModal.none')}
                    </td></tr>
                  ) : investments.map((inv: any) => (
                    <tr key={inv.id} onClick={() => { setRecordTarget(inv); setAdvancedOpen(false); }}
                        style={{ cursor:'pointer' }} title={t('admin:capitalModal.openRecord')}>
                      <td>{inv.project?.title || <span style={{ color:'var(--text-muted)' }}>{t('admin:capitalModal.noProject')}</span>}</td>
                      <td className="ltr-embed">{formatEur(inv.amount)}</td>
                      <td className="ltr-embed" style={{ fontWeight:600, color:'var(--text-primary)' }}>{formatEur(outstandingOf(inv))}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:12 }}>{formatDate(inv.investedAt)}</td>
                      <td>
                        <span className={`badge ${statusBadgeClass(inv.status)}`}>
                          {t(`common:status.${inv.status.toLowerCase()}`, { defaultValue: inv.status })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>{t('common:action.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: one record, read-only ── */}
      {recordTarget && (
        <div className="modal-overlay" onClick={() => setRecordTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <p className="modal-title">{t('admin:capitalModal.recordTitle')}</p>
            <div style={{ fontSize:13, display:'grid', gap:8, marginBottom:16 }}>
              {([
                { id:'member',   label: t('admin:capitalModal.member'),          value: member.name },
                { id:'email',    label: t('admin:capitalModal.email'),           value: member.email, ltr: true },
                { id:'project',  label: t('admin:capitalModal.cols.project'),    value: recordTarget.project?.title || t('admin:capitalModal.noProject') },
                { id:'booked',   label: t('admin:capitalModal.capitalBooked'),   value: formatEur(recordTarget.amount), ltr: true },
                { id:'returned', label: t('admin:capitalModal.capitalReturned'), value: formatEur(recordTarget.returnedAmount || 0), ltr: true },
                { id:'out',      label: t('admin:capitalModal.outstanding'),     value: formatEur(outstandingOf(recordTarget)), ltr: true },
                { id:'date',     label: t('admin:capitalModal.investedOn'),      value: formatDate(recordTarget.investedAt) },
                { id:'status',   label: t('admin:capitalModal.status'),          value: t(`common:status.${String(recordTarget.status).toLowerCase()}`, { defaultValue: recordTarget.status }) },
              ] as { id:string; label:string; value:string; ltr?:boolean }[]).map(({ id, label, value, ltr }) => (
                <div key={id} style={{ display:'flex', justifyContent:'space-between', gap:16 }}>
                  <span style={{ color:'var(--text-muted)' }}>{label}</span>
                  <span className={ltr ? 'ltr-embed' : undefined}
                    style={{ color:'var(--text-primary)', fontWeight:600, textAlign:'end' }}>{value || '-'}</span>
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
                    {t('admin:capitalModal.showRestricted')}
                  </button>
                ) : (
                  <div style={{ border:'1px solid var(--red)', borderRadius:6, padding:12, background:'rgba(224,82,82,0.06)' }}>
                    <p style={{ fontSize:12, fontWeight:700, color:'var(--red)', marginBottom:6 }}>{t('admin:capitalModal.restricted')}</p>
                    <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:10 }}>
                      {t('admin:capitalModal.restrictedWarning')}
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
                      {t('admin:capitalModal.returnCapitalEllipsis')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setRecordTarget(null)}>{t('common:action.back')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 5: amount plus a typed confirmation ── */}
      {returnTarget && (
        <div className="modal-overlay" onClick={() => setReturnTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <p className="modal-title">{t('admin:capitalModal.returnCapital')}</p>
            <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14 }}>
              <Trans
                i18nKey="admin:capitalModal.returnIntro"
                values={{
                  name: member.name,
                  project: returnTarget.project?.title || t('admin:capitalModal.generalInvestment'),
                  amount: formatEur(outstandingOf(returnTarget)),
                }}
                components={[
                  <span key="0" />,
                  <strong key="1" style={{ color:'var(--text-primary)' }} />,
                  <span key="2" />,
                  <strong key="3" style={{ color:'var(--text-primary)' }} />,
                ]}
              />
            </p>
            <div className="form-group">
              <label className="form-label">{t('admin:capitalModal.amountToReturn')}</label>
              <input className="form-input" type="number" min="0.01" step="0.01"
                placeholder={t('admin:capitalModal.amountPlaceholder')}
                value={returnAmount} onChange={e => setReturnAmount(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('admin:capitalModal.confirmLabel', { phrase: returnPhrase })}</label>
              <input className="form-input" type="text" autoComplete="off"
                placeholder={returnPhrase}
                value={returnConfirm} onChange={e => setReturnConfirm(e.target.value)} />
            </div>
            {returnError && <p className="form-error">{returnError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" disabled={returning}
                onClick={() => setReturnTarget(null)}>{t('common:action.cancel')}</button>
              <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
                disabled={returning || returnConfirm.trim().toUpperCase() !== returnPhrase}
                onClick={async () => {
                  setReturning(true);
                  setReturnError('');
                  try {
                    await investmentAPI.returnCapital(returnTarget.id, returnAmount ? { amount: returnAmount } : {});
                    setReturnTarget(null);
                    await load();
                    onDone?.();
                  } catch (err: any) {
                    setReturnError(err.response?.data?.error || t('admin:capitalModal.failed'));
                  } finally {
                    setReturning(false);
                  }
                }}>
                {returning ? t('admin:capitalModal.working') : t('admin:capitalModal.returnCapital')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
