'use client';
// src/app/admin/members/detail/page.tsx
//
// One member, everything about their money. Opened by clicking a row in Active
// Members, and the only screen that can email a member their full statement.
//
// Every figure here comes from the /admin/members/:id/overview payload, which
// derives balances through walletService — the page never adds up amounts
// itself, so it cannot disagree with the member's own dashboard. The statement
// email is rendered server-side from that same payload, so "Email Now" sends
// exactly what is on screen.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { adminAPI, formatEur, formatNumber } from '@/lib/api';
import {
  PortfolioChart, MonthlyActivityChart, ProjectSplitChart,
} from '@/components/admin/MemberCharts';
import MemberCapitalModal from '@/components/admin/MemberCapitalModal';
import { openDocument } from '@/lib/openDocument';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';
import { Trans, useTranslation } from 'react-i18next';

const FILE_BASE = process.env.NODE_ENV === 'production'
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';
const fileUrl = (path?: string | null) => (path ? `${FILE_BASE}${path}` : null);

const shortDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const badgeFor = (status?: string | null) =>
  status === 'ACTIVE' || status === 'COMPLETED' || status === 'APPROVED' || status === 'approved'
    ? 'badge-completed'
    : status === 'PENDING' || status === 'pending' || status === 'PAYMENT_RECEIVED'
      ? 'badge-pending'
      : 'badge-failed';

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 20,
};

function Section({
  title, subtitle, children, right,
}: {
  title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</p>
          {subtitle && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Table({
  head, align = [], rows, empty,
}: {
  head: string[]; align?: boolean[]; rows: React.ReactNode[][]; empty: string;
}) {
  return (
    <div className="tx-table-wrap">
      <table className="tx-table">
        <thead>
          <tr>{head.map((h, i) => (
            <th key={h} style={align[i] ? { textAlign: 'right' } : undefined}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={head.length} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>{empty}</td></tr>
          ) : rows.map((cells, r) => (
            <tr key={r}>{cells.map((c, i) => (
              <td key={i} style={align[i] ? { textAlign: 'right' } : undefined}>{c}</td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MemberDetailContent() {
  const { t } = useTranslation(['admin', 'common', 'dashboard']);
  const id = useSearchParams().get('id');
  const router = useRouter();
  const { user } = useAuth();
  const isSuper = isSuperAdminRole(user?.role);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Email Now: a confirm step first, because this sends a real document to a
  // real member and cannot be recalled.
  // Capital records, moved here off the Active Members list: the member's
  // capital belongs on the member's page, and this stays the only route into
  // returning capital.
  const [capitalOpen, setCapitalOpen] = useState(false);

  // Member actions, moved here off the Active Members list: every action that
  // changes one member now lives on that member's own page, so the list is
  // read-only. Opening balances and freezing are super admin only — see
  // src/lib/roles.ts.
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletForm, setWalletForm] = useState({ investmentAmount: '', profitAmount: '' });
  const [walletMsg, setWalletMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [acting, setActing] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailNote, setEmailNote] = useState('');
  const [sending, setSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');

  useEffect(() => {
    // Reached without ?id= - nothing to load, so say so rather than spin.
    if (!id) {
      setError(t('admin:memberDetail.noneSelected'));
      setLoading(false);
      return;
    }
    setLoading(true);
    adminAPI.getMemberOverview(id)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || t('admin:memberDetail.loadFailed')))
      .finally(() => setLoading(false));
  }, [id]);

  const reload = () => {
    if (id) adminAPI.getMemberOverview(id).then(r => setData(r.data));
  };

  // The flag only. The opening-balance form below is a separate path.
  const handleEnableWallet = async () => {
    if (!id) return;
    setActing(true);
    setActionErr('');
    try {
      await adminAPI.setWalletEnabled(id, true);
      reload();
    } catch (e: any) {
      setActionErr(e.response?.data?.error || t('admin:memberDetail.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  // Freezing locks a member out of the platform.
  const handleFreeze = async () => {
    if (!id) return;
    setActing(true);
    setActionErr('');
    try {
      await adminAPI.toggleFreeze(id);
      reload();
    } catch (e: any) {
      setActionErr(e.response?.data?.error || t('admin:memberDetail.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const handleUpdateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setActing(true);
    setActionErr('');
    try {
      const res = await adminAPI.updateWallet(id, walletForm);
      setWalletMsg(res.data?.walletActivated
        ? t('admin:wallet.activated')
        : t('admin:wallet.updated'));
      setTimeout(() => { setWalletOpen(false); setWalletMsg(''); }, 2000);
      reload();
    } catch (err: any) {
      setActionErr(err.response?.data?.error || t('admin:memberDetail.actionFailed'));
    } finally {
      setActing(false);
    }
  };

  const handleSend = async () => {
    if (!id) return;
    setSending(true);
    setEmailErr('');
    try {
      const res = await adminAPI.sendMemberStatement(id, emailNote.trim() || undefined);
      setEmailMsg(res.data.message || t('admin:memberDetail.statementSent'));
      setEmailOpen(false);
      setEmailNote('');
      setTimeout(() => setEmailMsg(''), 6000);
    } catch (e: any) {
      setEmailErr(e.response?.data?.error || t('admin:memberDetail.statementFailed'));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ margin: 60, textAlign: 'center' }}><div className="spinner" /></div>;
  if (error || !data) {
    return (
      <div className="content-left">
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--red)', marginBottom: 16 }}>{error || t('admin:memberDetail.notFound')}</p>
          <button className="btn-secondary" onClick={() => router.push('/admin')}>{t('admin:memberDetail.backToAdmin')}</button>
        </div>
      </div>
    );
  }

  const {
    member, kpis, breakdown, byProject, investments, profitRecords,
    transactions, withdrawRequests, profitConfigs, investmentRequests, series,
  } = data;
  const profile = member.profile || {};

  // `key` is the stable React key; `label` is translated.
  const tiles = [
    { key: 'investedCapital',   label: t('admin:memberDetail.tiles.investedCapital'),   value: formatEur(kpis.investedCapital) },
    { key: 'totalBalance',      label: t('admin:memberDetail.tiles.totalBalance'),      value: formatEur(kpis.totalBalance), accent: 'var(--accent-gold)' },
    { key: 'profitEarned',      label: t('admin:memberDetail.tiles.profitEarned'),      value: formatEur(kpis.grossProfit), accent: 'var(--green)' },
    { key: 'availableProfit',   label: t('admin:memberDetail.tiles.availableProfit'),   value: formatEur(kpis.availableProfit), accent: 'var(--green)' },
    { key: 'withdrawn',         label: t('admin:memberDetail.tiles.withdrawn'),         value: formatEur(kpis.withdrawnProfit) },
    { key: 'pendingWithdrawal', label: t('admin:memberDetail.tiles.pendingWithdrawal'), value: formatEur(kpis.pendingWithdrawal) },
    { key: 'roi',               label: t('admin:memberDetail.tiles.roi'),               value: `${formatNumber(kpis.roi)}%` },
    { key: 'projects',          label: t('admin:memberDetail.tiles.projects'),          value: formatNumber(kpis.projectCount) },
  ];

  const docs: { key: string; label: string; url?: string | null }[] = [
    { key: 'tradeLicence', label: t('admin:memberDetail.docs.tradeLicence'), url: profile.tradeLicenseUrl },
    { key: 'residentId',   label: t('admin:memberDetail.docs.residentId'),   url: profile.residentIdUrl },
    { key: 'passport',     label: t('admin:memberDetail.docs.passport'),     url: profile.passportUrl },
    { key: 'cv',           label: t('admin:memberDetail.docs.cv'),           url: profile.cvUrl },
  ];

  return (
    <div className="content-left">

      {/* ── Header ── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => router.push('/admin')}
            style={{
              width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'transparent',
              color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            aria-label={t('admin:memberDetail.backAria')}>
            {/* A back chevron is directional and mirrors in RTL. */}
            <svg className="rtl-mirror" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {member.profilePhoto ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={fileUrl(member.profilePhoto) || ''} alt={member.name}
              style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
          ) : (
            <div style={{
              width: 46, height: 46, borderRadius: '50%', background: 'rgba(58,111,255,0.15)',
              color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 17,
            }}>{(member.name || '?').charAt(0).toUpperCase()}</div>
          )}
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{member.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span className="ltr-embed">{member.email}</span> · {t('admin:memberDetail.memberSince', { date: shortDate(kpis.joinedAt) })}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${badgeFor(member.status)}`}>
            {t(`common:status.${String(member.status).toLowerCase()}`, { defaultValue: member.status })}
          </span>
          {/* One whole key per state, not "Wallet " + adjective: the adjective
              inflects with the noun in Italian. */}
          <span className={`badge ${member.walletEnabled ? 'badge-completed' : 'badge-pending'}`}>
            {member.walletEnabled ? t('admin:memberDetail.walletEnabled') : t('admin:memberDetail.walletDisabled')}
          </span>
          {!member.walletEnabled && (
            <button
              disabled={acting}
              style={{ padding: '8px 14px', fontSize: 12, borderRadius: 6, cursor: acting ? 'default' : 'pointer',
                border: '1px solid rgba(58,111,255,0.3)', background: 'rgba(58,111,255,0.1)', color: 'var(--accent-blue)' }}
              onClick={handleEnableWallet}>
              {t('admin:members.enableWallet')}
            </button>
          )}
          {/* Opening balances overwrite a figure with no ledger entry behind
              it, so they are super admin only. */}
          {isSuper && (
            <button
              style={{ padding: '8px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                border: '1px solid rgba(197,164,74,0.3)', background: 'rgba(197,164,74,0.1)', color: 'var(--gold, #c5a44a)' }}
              onClick={() => {
                setWalletForm({
                  investmentAmount: String(breakdown.openingCapital ?? 0),
                  profitAmount:     String(breakdown.openingProfit ?? 0),
                });
                setWalletMsg('');
                setActionErr('');
                setWalletOpen(true);
              }}>
              {t('admin:members.openingBalance')}
            </button>
          )}
          {isSuper && (
            <button
              disabled={acting}
              style={{
                padding: '8px 14px', fontSize: 12, borderRadius: 6, cursor: acting ? 'default' : 'pointer',
                border:     member.status === 'FROZEN' ? '1px solid rgba(76,217,138,0.3)' : '1px solid rgba(224,82,82,0.3)',
                background: member.status === 'FROZEN' ? 'rgba(76,217,138,0.1)'           : 'rgba(224,82,82,0.1)',
                color:      member.status === 'FROZEN' ? 'var(--green)'                   : 'var(--red)',
              }}
              onClick={handleFreeze}>
              {member.status === 'FROZEN' ? t('admin:members.unfreeze') : t('admin:members.freeze')}
            </button>
          )}
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '9px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}
            onClick={() => { setEmailErr(''); setEmailOpen(true); }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" />
            </svg>
            {t('admin:memberDetail.emailNow')}
          </button>
        </div>
      </div>

      {actionErr && (
        <div style={{
          padding: '11px 16px', marginBottom: 18, borderRadius: 'var(--radius-sm)',
          background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)',
          color: 'var(--red)', fontSize: 13,
        }}>{actionErr}</div>
      )}

      {emailMsg && (
        <div style={{
          padding: '11px 16px', marginBottom: 18, borderRadius: 'var(--radius-sm)',
          background: 'rgba(76,217,138,0.1)', border: '1px solid rgba(76,217,138,0.3)',
          color: 'var(--green)', fontSize: 13,
        }}>{emailMsg}</div>
      )}

      {/* ── KPI tiles ── */}
      <div className="admin-grid">
        {/* Renamed from `t` so the map variable no longer shadows the
            translator function. */}
        {tiles.map(tile => (
          <div key={tile.key} className="admin-stat-card">
            <p className="admin-stat-label">{tile.label}</p>
            <p className="admin-stat-value ltr-embed" style={tile.accent ? { color: tile.accent } : undefined}>{tile.value}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <Section
        title={t('admin:memberDetail.portfolioTitle')}
        subtitle={t('admin:memberDetail.portfolioSub')}>
        <div style={{ height: 300 }}>
          {series.length > 1
            ? <PortfolioChart series={series} />
            : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                {t('admin:memberDetail.notEnoughHistory')}
              </p>}
        </div>
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('admin:memberDetail.monthlyActivity')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            {t('admin:memberDetail.monthlyActivitySub')}
          </p>
          <div style={{ height: 260 }}>
            {series.length
              ? <MonthlyActivityChart series={series} />
              : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>{t('admin:memberDetail.noActivity')}</p>}
          </div>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('admin:memberDetail.capitalByProject')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            {t('admin:memberDetail.capitalByProjectSub')}
          </p>
          <div style={{ height: 260 }}>
            {byProject.some((p: any) => p.capital > 0)
              ? <ProjectSplitChart rows={byProject} />
              : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>{t('admin:memberDetail.noCapitalBooked')}</p>}
          </div>
        </div>
      </div>

      {/* ── Balance breakdown ── */}
      <Section
        title={t('admin:memberDetail.breakdownTitle')}
        subtitle={t('admin:memberDetail.breakdownSub')}>
        <Table
          head={[t('admin:memberDetail.breakdownHead.bucket'), t('admin:memberDetail.breakdownHead.opening'), t('admin:memberDetail.breakdownHead.fromProjects'), t('admin:memberDetail.breakdownHead.total')]}
          align={[false, true, true, true]}
          empty={t('admin:memberDetail.noWallet')}
          rows={[
            [t('admin:memberDetail.rowCapital'), formatEur(breakdown.openingCapital), formatEur(breakdown.projectCapital),
              <strong key="c">{formatEur(breakdown.investedCapital)}</strong>],
            [t('admin:memberDetail.rowProfitGross'), formatEur(breakdown.openingProfit), formatEur(breakdown.projectProfit),
              <strong key="p">{formatEur(breakdown.grossProfit)}</strong>],
            [t('admin:memberDetail.rowLessWithdrawn'), '—', '—', `- ${formatEur(breakdown.withdrawnProfit)}`],
            [t('admin:memberDetail.rowLessReserved'), '—', '—', `- ${formatEur(breakdown.pendingWithdrawal)}`],
            [<strong key="t">{t('admin:memberDetail.rowTotalBalance')}</strong>, '—', '—',
              <strong key="tv" style={{ color: 'var(--accent-gold)' }}>{formatEur(breakdown.totalBalance)}</strong>],
          ]}
        />
      </Section>

      {/* ── Per project ── */}
      <Section
        title={t('admin:memberDetail.projectsTitle')}
        subtitle={t('admin:memberDetail.projectsSub')}>
        <Table
          head={[t('admin:memberDetail.projectsHead.project'), t('admin:memberDetail.projectsHead.category'), t('admin:memberDetail.projectsHead.status'), t('admin:memberDetail.projectsHead.capital'), t('admin:memberDetail.projectsHead.profit')]}
          align={[false, false, false, true, true]}
          empty={t('admin:memberDetail.noCapitalAnyProject')}
          rows={[
            ...byProject.map((p: any) => [
              p.projectTitle,
              p.category || '—',
              p.status ? <span key="s" className={`badge ${badgeFor(p.status)}`}>
                {t(`common:status.${String(p.status).toLowerCase()}`, { defaultValue: p.status })}
              </span> : '—',
              formatEur(p.capital),
              <span key="pr" className="amount-credit">+{formatEur(p.profit)}</span>,
            ]),
            ...(breakdown.openingCapital > 0 || breakdown.openingProfit > 0 ? [[
              t('admin:memberDetail.openingBalance'), '—', '—',
              formatEur(breakdown.openingCapital),
              <span key="op" className="amount-credit">+{formatEur(breakdown.openingProfit)}</span>,
            ]] : []),
          ]}
        />
      </Section>

      {/* ── Investments ── */}
      <Section
        title={t('admin:memberDetail.investmentsTitle', { count: investments.length })}
        subtitle={t('admin:memberDetail.investmentsSub')}
        right={investments.length > 0 ? (
          <button
            style={{ padding:'6px 14px', fontSize:12, borderRadius:6, cursor:'pointer',
              border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)' }}
            onClick={() => setCapitalOpen(true)}>
            {t('admin:memberDetail.capitalRecords')}
          </button>
        ) : undefined}>
        <Table
          head={[t('admin:memberDetail.investmentsHead.project'), t('admin:memberDetail.investmentsHead.investedOn'), t('admin:memberDetail.investmentsHead.amount'), t('admin:memberDetail.investmentsHead.returned'), t('admin:memberDetail.investmentsHead.outstanding'), t('admin:memberDetail.investmentsHead.status')]}
          align={[false, false, true, true, true, false]}
          empty={t('admin:memberDetail.noInvestments')}
          rows={investments.map((i: any) => [
            i.project?.title || t('admin:memberDetail.noProject'),
            shortDate(i.investedAt),
            formatEur(i.amount),
            formatEur(i.returnedAmount || 0),
            formatEur(Math.max(0, i.amount - (i.returnedAmount || 0))),
            <span key="s" className={`badge ${badgeFor(i.status)}`}>
              {t(`common:status.${String(i.status).toLowerCase()}`, { defaultValue: i.status })}
            </span>,
          ])}
        />
      </Section>

      {/* ── Profit ── */}
      <Section
        title={t('admin:memberDetail.profitTitle', { count: profitRecords.length })}
        subtitle={t('admin:memberDetail.profitSub')}>
        <Table
          head={[t('admin:memberDetail.profitHead.project'), t('admin:memberDetail.profitHead.period'), t('admin:memberDetail.profitHead.type'), t('admin:memberDetail.profitHead.rate'), t('admin:memberDetail.profitHead.capitalBase'), t('admin:memberDetail.profitHead.profit'), t('admin:memberDetail.profitHead.credited')]}
          align={[false, false, false, true, true, true, false]}
          empty={t('admin:memberDetail.noProfit')}
          rows={profitRecords.map((r: any) => [
            r.project?.title || t('admin:memberDetail.noProject'),
            // A one-time period is an internal uniqueness token, not a cycle.
            String(r.period).startsWith('ONE_TIME') ? t('admin:memberDetail.oneTime') : r.period,
            t(`admin:investments.type${r.type === 'MONTHLY' ? 'Monthly' : 'OneTime'}`),
            r.rate != null ? `${formatNumber(r.rate)}%` : '—',
            formatEur(r.capitalSnapshot),
            <span key="a" className="amount-credit">+{formatEur(r.amount)}</span>,
            shortDate(r.generatedAt),
          ])}
        />
      </Section>

      {profitConfigs.length > 0 && (
        <Section title={t('admin:memberDetail.ratesTitle')} subtitle={t('admin:memberDetail.ratesSub')}>
          <Table
            head={[t('admin:memberDetail.ratesHead.project'), t('admin:memberDetail.ratesHead.rate'), t('admin:memberDetail.ratesHead.cycleDay'), t('admin:memberDetail.ratesHead.effectiveFrom')]}
            align={[false, true, true, false]}
            empty={t('admin:memberDetail.noRate')}
            rows={profitConfigs.map((c: any) => [
              c.project?.title || t('admin:memberDetail.noProject'),
              `${formatNumber(c.rate)}%`,
              formatNumber(c.monthlyProfitDay),
              shortDate(c.effectiveFrom),
            ])}
          />
        </Section>
      )}

      {/* ── Transactions ── */}
      <Section title={t('admin:memberDetail.transactionsTitle', { count: transactions.length })} subtitle={t('admin:memberDetail.transactionsSub')}>
        <Table
          head={[t('admin:memberDetail.txHead.date'), t('admin:memberDetail.txHead.description'), t('admin:memberDetail.txHead.category'), t('admin:memberDetail.txHead.project'), t('admin:memberDetail.txHead.amount'), t('admin:memberDetail.txHead.balanceAfter'), t('admin:memberDetail.txHead.status')]}
          align={[false, false, false, false, true, true, false]}
          empty={t('admin:memberDetail.noTransactions')}
          // The map variable is `tx`, not `t`: it used to shadow the translator.
          rows={transactions.map((tx: any) => [
            shortDate(tx.createdAt),
            tx.description || '—',
            tx.category ? t(`dashboard:transactions.category.${tx.category}`, { defaultValue: tx.category }) : '—',
            tx.project?.title || '—',
            <span key="a" className={tx.type === 'DEBIT' ? 'amount-debit' : 'amount-credit'}>
              {tx.type === 'DEBIT' ? '-' : '+'}{formatEur(tx.amount)}
            </span>,
            tx.balanceAfter != null ? formatEur(tx.balanceAfter) : '—',
            <span key="s" className={`badge ${badgeFor(tx.status)}`}>
              {t(`dashboard:transactions.txStatus.${tx.status}`, { defaultValue: tx.status })}
            </span>,
          ])}
        />
      </Section>

      {/* ── Withdrawals & requests ── */}
      <Section title={t('admin:memberDetail.withdrawalsTitle', { count: withdrawRequests.length })}>
        <Table
          head={[t('admin:memberDetail.wdHead.date'), t('admin:memberDetail.wdHead.bank'), t('admin:memberDetail.wdHead.iban'), t('admin:memberDetail.wdHead.amount'), t('admin:memberDetail.wdHead.status')]}
          align={[false, false, false, true, false]}
          empty={t('admin:memberDetail.noWithdrawals')}
          rows={withdrawRequests.map((w: any) => [
            shortDate(w.createdAt),
            w.bankName || '—',
            <span key="ib" className="ltr-embed">{w.iban || '—'}</span>,
            formatEur(w.amount),
            <span key="s" className={`badge ${badgeFor(w.status)}`}>
              {t(`common:status.${String(w.status).toLowerCase()}`, { defaultValue: w.status })}
            </span>,
          ])}
        />
      </Section>

      <Section title={t('admin:memberDetail.requestsTitle', { count: investmentRequests.length })} subtitle={t('admin:memberDetail.requestsSub')}>
        <Table
          head={[t('admin:memberDetail.reqHead.date'), t('admin:memberDetail.reqHead.project'), t('admin:memberDetail.reqHead.requested'), t('admin:memberDetail.reqHead.actual'), t('admin:memberDetail.reqHead.status')]}
          align={[false, false, true, true, false]}
          empty={t('admin:memberDetail.noRequests')}
          rows={investmentRequests.map((r: any) => [
            shortDate(r.createdAt),
            r.project?.title || '—',
            formatEur(r.requestedAmount),
            r.actualAmount != null ? formatEur(r.actualAmount) : '—',
            <span key="s" className={`badge ${badgeFor(r.status)}`}>
              {t(`admin:requests.statusLabel.${r.status}`, { defaultValue: r.status })}
            </span>,
          ])}
        />
      </Section>

      {/* ── Member details ── */}
      <Section title={t('admin:memberDetail.detailsTitle')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {/* `ltr` marks the values that must not be bidi-reordered: email,
              phone and VAT number. `id` keys the cell, not the label. */}
          {([
            { id: 'fullName',  label: t('admin:memberDetail.fields.fullName'),  value: member.name },
            { id: 'email',     label: t('admin:memberDetail.fields.email'),     value: member.email, ltr: true },
            { id: 'phone',     label: t('admin:memberDetail.fields.phone'),     value: [profile.phoneDialCode, profile.phone].filter(Boolean).join(' ') || '—', ltr: true },
            { id: 'type',      label: t('admin:memberDetail.fields.accountType'), value: member.accountType || '—' },
            { id: 'kyc',       label: t('admin:memberDetail.fields.kycStatus'), value: member.kycStatus ? t(`common:status.${String(member.kycStatus).toLowerCase()}`, { defaultValue: member.kycStatus }) : '—' },
            { id: 'company',   label: t('admin:memberDetail.fields.company'),   value: profile.company || '—' },
            { id: 'industry',  label: t('admin:memberDetail.fields.industry'),  value: profile.industry || '—' },
            { id: 'city',      label: t('admin:memberDetail.fields.city'),      value: profile.city || '—' },
            { id: 'country',   label: t('admin:memberDetail.fields.country'),   value: profile.country || '—' },
            { id: 'vat',       label: t('admin:memberDetail.fields.vat'),       value: profile.vatNumber || '—', ltr: true },
            { id: 'billing',   label: t('admin:memberDetail.fields.billing'),   value: profile.billingAddress || profile.businessAddress || '—' },
            { id: 'joined',    label: t('admin:memberDetail.fields.joined'),    value: shortDate(member.createdAt) },
            { id: 'firstInv',  label: t('admin:memberDetail.fields.firstInvestment'), value: shortDate(kpis.firstInvestmentAt) },
          ] as { id: string; label: string; value: string; ltr?: boolean }[]).map(({ id, label, value, ltr }) => (
            <div key={id}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
              <p className={ltr ? 'ltr-embed' : undefined}
                style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value || '—'}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {t('admin:memberDetail.documentsTitle')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {docs.filter(d => d.url).map(d => (
              <button key={d.key} onClick={() => openDocument(d.url)}
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  border: '1px solid rgba(58,111,255,0.3)', background: 'rgba(58,111,255,0.1)', color: 'var(--accent-blue)',
                }}>
                {d.label}
              </button>
            ))}
            {(member.kycDocuments || []).map((k: any) => (
              <button key={k.id} onClick={() => openDocument(k.documentUrl)}
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)',
                }}>
                {t('admin:memberDetail.kycDoc', { type: k.documentType, status: k.status })}
              </button>
            ))}
            {docs.every(d => !d.url) && (member.kycDocuments || []).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('admin:memberDetail.noDocuments')}</p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Opening balance ── */}
      {walletOpen && (
        <div className="modal-overlay" onClick={() => { setWalletOpen(false); setWalletMsg(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">{t('admin:wallet.title', { name: member.name })}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, marginTop: -10 }}>
              {t('admin:wallet.intro')}
            </p>
            <form onSubmit={handleUpdateWallet}>
              <div className="form-group">
                <label className="form-label">{t('admin:wallet.openingCapital')}</label>
                <input className="form-input" type="number" min="0" step="0.01"
                  value={walletForm.investmentAmount}
                  onChange={e => setWalletForm(p => ({ ...p, investmentAmount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('admin:wallet.openingProfit')}</label>
                <input className="form-input" type="number" min="0" step="0.01"
                  value={walletForm.profitAmount}
                  onChange={e => setWalletForm(p => ({ ...p, profitAmount: e.target.value }))} />
              </div>
              {/* Live total preview */}
              <div style={{
                background: 'rgba(58,111,255,0.06)',
                border: '1px solid rgba(58,111,255,0.15)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block' }}>{t('admin:wallet.newTotal')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {t('admin:wallet.includes', {
                      capital: formatEur(breakdown.projectCapital || 0),
                      profit:  formatEur(breakdown.projectProfit || 0),
                    })}
                  </span>
                </div>
                <span className="ltr-embed" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatEur(
                    (parseFloat(walletForm.investmentAmount) || 0) +
                    (parseFloat(walletForm.profitAmount)     || 0) +
                    (breakdown.projectCapital                || 0) +
                    (breakdown.projectProfit                 || 0)
                  )}
                </span>
              </div>
              {walletMsg && (
                <p style={{ color: 'var(--green)', fontSize: 12, marginBottom: 8 }}>{walletMsg}</p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary"
                  onClick={() => { setWalletOpen(false); setWalletMsg(''); }}>
                  {t('common:action.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={acting}
                  style={{ width: 'auto', padding: '10px 24px' }}>
                  {t('admin:wallet.update')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {capitalOpen && (
        <MemberCapitalModal
          member={member}
          onClose={() => setCapitalOpen(false)}
          onDone={reload}
        />
      )}

      {/* ── Email Now confirmation ── */}
      {emailOpen && (
        <div className="modal-overlay" onClick={() => !sending && setEmailOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <p className="modal-title">{t('admin:memberDetail.emailTitle')}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              <Trans
                i18nKey="admin:memberDetail.emailIntro"
                values={{ name: member.name, email: member.email }}
                components={[
                  <span key="0" />,
                  <strong key="1" className="ltr-embed" style={{ color: 'var(--text-primary)' }} />,
                ]}
              />
            </p>

            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              {t('admin:memberDetail.noteLabel')}
            </label>
            <textarea
              className="filter-input"
              rows={3}
              value={emailNote}
              onChange={e => setEmailNote(e.target.value)}
              placeholder={t('admin:memberDetail.notePlaceholder')}
              style={{ width: '100%', resize: 'vertical', marginBottom: 14 }}
            />

            {emailErr && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{emailErr}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={sending}
                onClick={() => setEmailOpen(false)}>
                {t('common:action.cancel')}
              </button>
              <button type="button" className="btn-primary" disabled={sending}
                style={{ width: 'auto', padding: '10px 22px' }}
                onClick={handleSend}>
                {sending ? t('admin:memberDetail.sending') : t('admin:memberDetail.sendEmail')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminMemberDetailPage() {
  return (
    <ProtectedLayout requireAdmin>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={<div className="spinner" />}>
        <MemberDetailContent />
      </Suspense>
    </ProtectedLayout>
  );
}
