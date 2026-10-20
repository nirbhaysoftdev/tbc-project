'use client';
import { useEffect, useState } from 'react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useTranslation } from 'react-i18next';
import { withdrawAPI, formatEur, formatDate } from '@/lib/api';
import { useAdminAlerts } from '@/lib/adminAlerts';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';

interface Request {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  bankName: string;
  iban: string;
  swiftNumber: string;
  address: string;
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: { name: string; email: string };
}

function WithdrawalsContent() {
  const { t } = useTranslation(['admin', 'common']);
  const { user } = useAuth();
  const isSuper = isSuperAdminRole(user?.role);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Request | null>(null);
  const [processing, setProcessing] = useState('');
  const { refresh: refreshAlerts } = useAdminAlerts();

  const load = async () => {
    try {
      const res = await withdrawAPI.getAllRequests();
      setRequests(res.data.requests);
      refreshAlerts();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handle = async (id: string, action: 'approve' | 'reject') => {
    setProcessing(id + action);
    try {
      if (action === 'approve') await withdrawAPI.approve(id);
      else await withdrawAPI.reject(id);
      await load();
      setSelected(null);
    } catch (e: any) {
      alert(e.response?.data?.error || t('admin:withdrawals.actionFailedAlert'));
    }
    setProcessing('');
  };

  const statusColor = (s: string) =>
    s === 'APPROVED' ? 'var(--green)' : s === 'REJECTED' ? 'var(--red)' : '#ffbe32';

  const statusBg = (s: string) =>
    s === 'APPROVED' ? 'rgba(76,217,138,0.1)' : s === 'REJECTED' ? 'rgba(224,82,82,0.1)' : 'rgba(255,190,50,0.1)';

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">{t('admin:withdrawals.title')}</h1>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {t('admin:withdrawals.pending', { count: requests.filter(r => r.status === 'PENDING').length })}
        </span>
      </div>

      {loading ? (
        <div className="spinner" />
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {t('admin:withdrawals.empty')}
        </div>
      ) : (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('admin:withdrawals.columns.member')}</th>
                <th>{t('admin:withdrawals.columns.amount')}</th>
                <th>{t('admin:withdrawals.columns.bank')}</th>
                <th>{t('admin:withdrawals.columns.reason')}</th>
                <th>{t('admin:withdrawals.columns.requested')}</th>
                <th>{t('admin:withdrawals.columns.status')}</th>
                <th>{t('admin:withdrawals.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.user.name}</div>
                    <div className="ltr-embed" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.user.email}</div>
                  </td>
                  {/* formatEur replaces a hardcoded €-prefixed toLocaleString,
                      so the amount follows the active locale. */}
                  <td className="ltr-embed" style={{ fontWeight: 700, color: 'var(--red)' }}>
                    {formatEur(r.amount)}
                  </td>
                  <td>
                    <div>{r.bankName}</div>
                    {/* An IBAN must never be bidi-reordered (§10). */}
                    <div className="ltr-embed" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.iban}</div>
                  </td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.reason}
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      color: statusColor(r.status), background: statusBg(r.status),
                    }}>
                      {t(`common:status.${r.status.toLowerCase()}`, { defaultValue: r.status })}
                    </span>
                  </td>
                  <td>
                    {r.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setSelected(r)}
                          style={{
                            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: 'rgba(76,217,138,0.15)', color: 'var(--green)',
                            border: '1px solid rgba(76,217,138,0.3)', cursor: 'pointer',
                          }}>
                          {t('admin:withdrawals.review')}
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('admin:withdrawals.done')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
            <h2 className="modal-title">{t('admin:withdrawals.reviewTitle')} - {selected.user.name}</h2>

            {/* `ltr: true` marks the banking identifiers — email, IBAN, SWIFT
                and the amount — that must not be reordered by bidi in an RTL
                page. `id` keys the row so a translated label is never the key. */}
            {([
              { id: 'member',   label: t('admin:withdrawals.columns.member'), value: selected.user.name },
              { id: 'email',    label: t('common:label.email'),               value: selected.user.email, ltr: true },
              { id: 'fullName', label: t('admin:withdrawals.fullName'),       value: `${selected.firstName} ${selected.lastName}` },
              { id: 'company',  label: t('common:label.company'),             value: selected.companyName },
              { id: 'bank',     label: t('admin:withdrawals.columns.bank'),   value: selected.bankName },
              { id: 'iban',     label: t('admin:withdrawals.columns.iban'),   value: selected.iban, ltr: true },
              { id: 'swift',    label: t('admin:withdrawals.swift'),          value: selected.swiftNumber, ltr: true },
              { id: 'address',  label: t('admin:withdrawals.address'),        value: selected.address },
              { id: 'amount',   label: t('common:label.amount'),              value: formatEur(selected.amount), ltr: true },
              { id: 'reason',   label: t('admin:withdrawals.columns.reason'), value: selected.reason },
            ] as { id: string; label: string; value: string; ltr?: boolean }[]).map(({ id, label, value, ltr }) => (
              <div key={id} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                {/* `end`, not `right`, so the value hugs the reading edge. */}
                <span className={ltr ? 'ltr-embed' : undefined}
                  style={{ fontSize: 13, color: 'var(--text-primary)', maxWidth: 280, textAlign: 'end' }}>
                  {value}
                </span>
              </div>
            ))}

            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn-secondary" onClick={() => setSelected(null)}>{t('common:action.close')}</button>
              {/* Both decisions are final and move money out of the platform,
                  so an admin can review a request but not settle it. */}
              {isSuper ? (
                <>
                  <button className="btn-danger"
                    disabled={processing === selected.id + 'reject'}
                    onClick={() => handle(selected.id, 'reject')}>
                    {processing === selected.id + 'reject' ? t('admin:withdrawals.rejecting') : t('admin:withdrawals.reject')}
                  </button>
                  <button className="btn-primary"
                    style={{ width: 'auto', padding: '10px 24px', marginTop: 0 }}
                    disabled={processing === selected.id + 'approve'}
                    onClick={() => handle(selected.id, 'approve')}>
                    {processing === selected.id + 'approve' ? t('admin:withdrawals.approving') : t('admin:withdrawals.approveDebit')}
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                  {t('admin:withdrawals.superAdminOnly',
                     'Approving or rejecting a withdrawal requires super admin access.')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WithdrawalsPage() {
  return (
    <ProtectedLayout requireAdmin>
      <WithdrawalsContent />
    </ProtectedLayout>
  );
}