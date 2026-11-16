'use client';
// src/components/insurance/ReturnsCard.tsx
//
// A member's recurring returns: the annual insurance and any monthly fix
// profit, each with the amount it will credit next.
//
// The amounts are recomputed by the server from the capital the member holds
// right now, so when capital goes up the figures follow. This refreshes every
// 30 seconds and whenever the tab comes back into view, rather than showing
// whatever was true when the page opened. Shows nothing for a member with
// neither.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dashboardAPI, formatEur, formatNumber, formatDate } from '@/lib/api';

const REFRESH_MS = 30_000;

export default function ReturnsCard() {
  const { t } = useTranslation(['dashboard']);
  const [data, setData] = useState<{ insurance: any | null; monthly: any[] } | null>(null);

  useEffect(() => {
    const load = () => { dashboardAPI.getReturns().then(r => setData(r.data)).catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const policy = data?.insurance;
  const monthly = data?.monthly || [];
  if (!policy && monthly.length === 0) return null;
  const active = policy?.status === 'ACTIVE';

  const frame: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)', marginBottom: 20, overflow: 'hidden',
  };
  const head: React.CSSProperties = {
    padding: '12px 20px', borderBottom: '1px solid var(--border-strong)', background: 'rgba(20,38,96,0.28)',
  };

  return (
    <div style={frame}>
      {policy && (
        <>
          <div style={head}>
            <p style={{ fontWeight: 700, fontSize: 14 }}>{t('dashboard:insurance.title')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {active ? t('dashboard:insurance.note', { rate: formatNumber(policy.ratePercent) }) : t('dashboard:insurance.disabledNote')}
            </p>
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <p className="stat-label">{t('dashboard:insurance.rate')}</p>
              <p className="stat-value ltr-embed">{formatNumber(policy.ratePercent)}%</p>
            </div>
            {active && (
              <>
                <div>
                  <p className="stat-label">{t('dashboard:returns.onCapital')}</p>
                  <p className="stat-value ltr-embed">{formatEur(policy.capital)}</p>
                </div>
                <div>
                  <p className="stat-label">{t('dashboard:returns.yearly')}</p>
                  <p className="stat-value ltr-embed">{formatEur(policy.receivedLastYear || 0)}</p>
                </div>
                <div>
                  <p className="stat-label">{t('dashboard:insurance.expected')}</p>
                  <p className="stat-value ltr-embed" style={{ color: 'var(--green)' }}>{formatEur(policy.expectedAmount)}</p>
                </div>
                <div>
                  <p className="stat-label">{t('dashboard:insurance.renewal')}</p>
                  <p className="stat-value">{formatDate(policy.renewalDate)}</p>
                </div>
              </>
            )}
            <span className={`badge ${active ? 'badge-completed' : 'badge-pending'}`}>
              {t(`dashboard:insurance.status.${policy.status}`)}
            </span>
          </div>
        </>
      )}

      {monthly.length > 0 && (
        <>
          <div style={{ ...head, ...(policy ? { borderTop: '1px solid var(--border-strong)' } : {}) }}>
            <p style={{ fontWeight: 700, fontSize: 14 }}>{t('dashboard:returns.monthlyTitle')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{t('dashboard:returns.monthlyNote')}</p>
          </div>
          <table className="tx-table" style={{ borderRadius: 0 }}>
            <thead>
              <tr>
                <th>{t('dashboard:returns.project')}</th>
                <th>{t('dashboard:returns.fix')}</th>
                <th>{t('dashboard:returns.onCapital')}</th>
                <th>{t('dashboard:returns.next')}</th>
                <th>{t('dashboard:returns.credit')}</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.project || t('dashboard:byProject.noProject')}</td>
                  <td className="ltr-embed">{m.fixedAmount != null ? formatEur(m.fixedAmount) : `${formatNumber(m.rate)}%`}</td>
                  <td className="ltr-embed">{formatEur(m.eligibleCapital)}</td>
                  <td>{formatDate(m.nextDate)}</td>
                  <td className="amount-credit ltr-embed">{formatEur(m.expectedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
