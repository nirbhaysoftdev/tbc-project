'use client';
// src/app/admin/members/[id]/page.tsx
//
// One member, everything about their money. Opened by clicking a row in Active
// Members, and the only screen that can email a member their full statement.
//
// Every figure here comes from the /admin/members/:id/overview payload, which
// derives balances through walletService — the page never adds up amounts
// itself, so it cannot disagree with the member's own dashboard. The statement
// email is rendered server-side from that same payload, so "Email Now" sends
// exactly what is on screen.
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { adminAPI, formatEur } from '@/lib/api';
import {
  PortfolioChart, MonthlyActivityChart, ProjectSplitChart,
} from '@/components/admin/MemberCharts';
import MemberCapitalModal from '@/components/admin/MemberCapitalModal';

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
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Email Now: a confirm step first, because this sends a real document to a
  // real member and cannot be recalled.
  // Capital records, moved here off the Active Members list: the member's
  // capital belongs on the member's page, and this stays the only route into
  // returning capital.
  const [capitalOpen, setCapitalOpen] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailNote, setEmailNote] = useState('');
  const [sending, setSending] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminAPI.getMemberOverview(id)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error || 'Could not load this member.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSend = async () => {
    setSending(true);
    setEmailErr('');
    try {
      const res = await adminAPI.sendMemberStatement(id, emailNote.trim() || undefined);
      setEmailMsg(res.data.message || 'Statement sent.');
      setEmailOpen(false);
      setEmailNote('');
      setTimeout(() => setEmailMsg(''), 6000);
    } catch (e: any) {
      setEmailErr(e.response?.data?.error || 'The statement could not be sent.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ margin: 60, textAlign: 'center' }}><div className="spinner" /></div>;
  if (error || !data) {
    return (
      <div className="content-left">
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--red)', marginBottom: 16 }}>{error || 'Member not found.'}</p>
          <button className="btn-secondary" onClick={() => router.push('/admin')}>Back to Admin</button>
        </div>
      </div>
    );
  }

  const {
    member, kpis, breakdown, byProject, investments, profitRecords,
    transactions, withdrawRequests, profitConfigs, investmentRequests, series,
  } = data;
  const profile = member.profile || {};

  const tiles = [
    { label: 'Invested Capital', value: formatEur(kpis.investedCapital) },
    { label: 'Total Balance',    value: formatEur(kpis.totalBalance), accent: 'var(--accent-gold)' },
    { label: 'Profit Earned',    value: formatEur(kpis.grossProfit), accent: 'var(--green)' },
    { label: 'Available Profit', value: formatEur(kpis.availableProfit), accent: 'var(--green)' },
    { label: 'Withdrawn',        value: formatEur(kpis.withdrawnProfit) },
    { label: 'Pending Withdrawal', value: formatEur(kpis.pendingWithdrawal) },
    { label: 'Return on Capital', value: `${kpis.roi}%` },
    { label: 'Projects',         value: kpis.projectCount },
  ];

  const docs: { label: string; url?: string | null }[] = [
    { label: 'Trade licence', url: profile.tradeLicenseUrl },
    { label: 'Resident ID',   url: profile.residentIdUrl },
    { label: 'Passport',      url: profile.passportUrl },
    { label: 'CV',            url: profile.cvUrl },
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
            aria-label="Back to admin panel">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
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
              {member.email} · Member since {shortDate(kpis.joinedAt)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${badgeFor(member.status)}`}>{member.status}</span>
          <span className={`badge ${member.walletEnabled ? 'badge-completed' : 'badge-pending'}`}>
            Wallet {member.walletEnabled ? 'enabled' : 'disabled'}
          </span>
          <button
            className="btn-primary"
            style={{ width: 'auto', padding: '9px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}
            onClick={() => { setEmailErr(''); setEmailOpen(true); }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" />
            </svg>
            Email Now
          </button>
        </div>
      </div>

      {emailMsg && (
        <div style={{
          padding: '11px 16px', marginBottom: 18, borderRadius: 'var(--radius-sm)',
          background: 'rgba(76,217,138,0.1)', border: '1px solid rgba(76,217,138,0.3)',
          color: 'var(--green)', fontSize: 13,
        }}>{emailMsg}</div>
      )}

      {/* ── KPI tiles ── */}
      <div className="admin-grid">
        {tiles.map(t => (
          <div key={t.label} className="admin-stat-card">
            <p className="admin-stat-label">{t.label}</p>
            <p className="admin-stat-value" style={t.accent ? { color: t.accent } : undefined}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      <Section
        title="Portfolio over time"
        subtitle="Invested capital, available profit and total balance at the end of each month, built from the investment and profit records behind them.">
        <div style={{ height: 300 }}>
          {series.length > 1
            ? <PortfolioChart series={series} />
            : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                Not enough history yet to draw a trend.
              </p>}
        </div>
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, marginBottom: 20 }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Monthly activity</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Profit credited, capital added and money withdrawn, month by month.
          </p>
          <div style={{ height: 260 }}>
            {series.length
              ? <MonthlyActivityChart series={series} />
              : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>No activity yet.</p>}
          </div>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Capital by project</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Where this member&apos;s live capital sits.
          </p>
          <div style={{ height: 260 }}>
            {byProject.some((p: any) => p.capital > 0)
              ? <ProjectSplitChart rows={byProject} />
              : <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>No capital booked.</p>}
          </div>
        </div>
      </div>

      {/* ── Balance breakdown ── */}
      <Section
        title="Balance breakdown"
        subtitle="Opening balance set by the admin tools, plus the capital and profit derived from project records.">
        <Table
          head={['Bucket', 'Opening balance', 'From projects', 'Total']}
          align={[false, true, true, true]}
          empty="No wallet."
          rows={[
            ['Capital', formatEur(breakdown.openingCapital), formatEur(breakdown.projectCapital),
              <strong key="c">{formatEur(breakdown.investedCapital)}</strong>],
            ['Profit (gross)', formatEur(breakdown.openingProfit), formatEur(breakdown.projectProfit),
              <strong key="p">{formatEur(breakdown.grossProfit)}</strong>],
            ['Less withdrawn', '—', '—', `- ${formatEur(breakdown.withdrawnProfit)}`],
            ['Less reserved for pending withdrawal', '—', '—', `- ${formatEur(breakdown.pendingWithdrawal)}`],
            [<strong key="t">Total balance</strong>, '—', '—',
              <strong key="tv" style={{ color: 'var(--accent-gold)' }}>{formatEur(breakdown.totalBalance)}</strong>],
          ]}
        />
      </Section>

      {/* ── Per project ── */}
      <Section
        title="Projects"
        subtitle="Capital and profit per project. Capital with no project is a supported, permanent case, and the opening balance is listed separately because no project stands behind it.">
        <Table
          head={['Project', 'Category', 'Status', 'Capital', 'Profit']}
          align={[false, false, false, true, true]}
          empty="No capital booked against any project."
          rows={[
            ...byProject.map((p: any) => [
              p.projectTitle,
              p.category || '—',
              p.status ? <span key="s" className={`badge ${badgeFor(p.status)}`}>{p.status}</span> : '—',
              formatEur(p.capital),
              <span key="pr" className="amount-credit">+{formatEur(p.profit)}</span>,
            ]),
            ...(breakdown.openingCapital > 0 || breakdown.openingProfit > 0 ? [[
              'Opening balance', '—', '—',
              formatEur(breakdown.openingCapital),
              <span key="op" className="amount-credit">+{formatEur(breakdown.openingProfit)}</span>,
            ]] : []),
          ]}
        />
      </Section>

      {/* ── Investments ── */}
      <Section
        title={`Investments (${investments.length})`}
        subtitle="Every capital allocation on record, newest first."
        right={investments.length > 0 ? (
          <button
            style={{ padding:'6px 14px', fontSize:12, borderRadius:6, cursor:'pointer',
              border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)' }}
            onClick={() => setCapitalOpen(true)}>
            Capital records
          </button>
        ) : undefined}>
        <Table
          head={['Project', 'Invested on', 'Amount', 'Returned', 'Outstanding', 'Status']}
          align={[false, false, true, true, true, false]}
          empty="No investments recorded."
          rows={investments.map((i: any) => [
            i.project?.title || 'No project',
            shortDate(i.investedAt),
            formatEur(i.amount),
            formatEur(i.returnedAmount || 0),
            formatEur(Math.max(0, i.amount - (i.returnedAmount || 0))),
            <span key="s" className={`badge ${badgeFor(i.status)}`}>{i.status}</span>,
          ])}
        />
      </Section>

      {/* ── Profit ── */}
      <Section
        title={`Profit records (${profitRecords.length})`}
        subtitle="Each monthly cycle or one-time credit, with the capital base and rate that produced it.">
        <Table
          head={['Project', 'Period', 'Type', 'Rate', 'Capital base', 'Profit', 'Credited']}
          align={[false, false, false, true, true, true, false]}
          empty="No profit credited yet."
          rows={profitRecords.map((r: any) => [
            r.project?.title || 'No project',
            // A one-time period is an internal uniqueness token, not a cycle.
            String(r.period).startsWith('ONE_TIME') ? 'One-time' : r.period,
            r.type,
            r.rate != null ? `${r.rate}%` : '—',
            formatEur(r.capitalSnapshot),
            <span key="a" className="amount-credit">+{formatEur(r.amount)}</span>,
            shortDate(r.generatedAt),
          ])}
        />
      </Section>

      {profitConfigs.length > 0 && (
        <Section title="Monthly profit rates in force" subtitle="A rate change takes effect from the next cycle; past records keep the rate that produced them.">
          <Table
            head={['Project', 'Rate', 'Cycle day', 'Effective from']}
            align={[false, true, true, false]}
            empty="No rate configured."
            rows={profitConfigs.map((c: any) => [
              c.project?.title || 'No project',
              `${c.rate}%`,
              c.monthlyProfitDay,
              shortDate(c.effectiveFrom),
            ])}
          />
        </Section>
      )}

      {/* ── Transactions ── */}
      <Section title={`Transactions (${transactions.length})`} subtitle="The ledger as the member sees it, newest first.">
        <Table
          head={['Date', 'Description', 'Category', 'Project', 'Amount', 'Balance after', 'Status']}
          align={[false, false, false, false, true, true, false]}
          empty="No transactions."
          rows={transactions.map((t: any) => [
            shortDate(t.createdAt),
            t.description || '—',
            t.category || '—',
            t.project?.title || '—',
            <span key="a" className={t.type === 'DEBIT' ? 'amount-debit' : 'amount-credit'}>
              {t.type === 'DEBIT' ? '-' : '+'}{formatEur(t.amount)}
            </span>,
            t.balanceAfter != null ? formatEur(t.balanceAfter) : '—',
            <span key="s" className={`badge ${badgeFor(t.status)}`}>{t.status}</span>,
          ])}
        />
      </Section>

      {/* ── Withdrawals & requests ── */}
      <Section title={`Withdrawal requests (${withdrawRequests.length})`}>
        <Table
          head={['Date', 'Bank', 'IBAN', 'Amount', 'Status']}
          align={[false, false, false, true, false]}
          empty="No withdrawal requests."
          rows={withdrawRequests.map((w: any) => [
            shortDate(w.createdAt),
            w.bankName || '—',
            w.iban || '—',
            formatEur(w.amount),
            <span key="s" className={`badge ${badgeFor(w.status)}`}>{w.status}</span>,
          ])}
        />
      </Section>

      <Section title={`Investment requests (${investmentRequests.length})`} subtitle="Asks from the Deal Room. A request has no financial effect until admin completes it.">
        <Table
          head={['Date', 'Project', 'Requested', 'Actual', 'Status']}
          align={[false, false, true, true, false]}
          empty="No investment requests."
          rows={investmentRequests.map((r: any) => [
            shortDate(r.createdAt),
            r.project?.title || '—',
            formatEur(r.requestedAmount),
            r.actualAmount != null ? formatEur(r.actualAmount) : '—',
            <span key="s" className={`badge ${badgeFor(r.status)}`}>{r.status}</span>,
          ])}
        />
      </Section>

      {/* ── Member details ── */}
      <Section title="Member details">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {[
            ['Full name', member.name],
            ['Email', member.email],
            ['Phone', [profile.phoneDialCode, profile.phone].filter(Boolean).join(' ') || '—'],
            ['Account type', member.accountType || '—'],
            ['KYC status', member.kycStatus || '—'],
            ['Company', profile.company || '—'],
            ['Industry', profile.industry || '—'],
            ['City', profile.city || '—'],
            ['Country', profile.country || '—'],
            ['VAT number', profile.vatNumber || '—'],
            ['Billing address', profile.billingAddress || profile.businessAddress || '—'],
            ['Joined', shortDate(member.createdAt)],
            ['First investment', shortDate(kpis.firstInvestmentAt)],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{(value as string) || '—'}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Documents
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {docs.filter(d => d.url).map(d => (
              <a key={d.label} href={fileUrl(d.url) || '#'} target="_blank" rel="noopener noreferrer"
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 6, textDecoration: 'none',
                  border: '1px solid rgba(58,111,255,0.3)', background: 'rgba(58,111,255,0.1)', color: 'var(--accent-blue)',
                }}>
                {d.label}
              </a>
            ))}
            {(member.kycDocuments || []).map((k: any) => (
              <a key={k.id} href={fileUrl(k.documentUrl) || '#'} target="_blank" rel="noopener noreferrer"
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 6, textDecoration: 'none',
                  border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)',
                }}>
                {k.documentType} ({k.status})
              </a>
            ))}
            {docs.every(d => !d.url) && (member.kycDocuments || []).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No documents on file.</p>
            )}
          </div>
        </div>
      </Section>

      {capitalOpen && (
        <MemberCapitalModal
          member={member}
          onClose={() => setCapitalOpen(false)}
          onDone={() => adminAPI.getMemberOverview(id).then(r => setData(r.data))}
        />
      )}

      {/* ── Email Now confirmation ── */}
      {emailOpen && (
        <div className="modal-overlay" onClick={() => !sending && setEmailOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <p className="modal-title">Email this statement</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              {member.name} will receive everything on this screen — balances, projects, investments,
              profit records, transactions and withdrawals — as a branded statement at{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{member.email}</strong>.
            </p>

            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Note to include (optional)
            </label>
            <textarea
              className="filter-input"
              rows={3}
              value={emailNote}
              onChange={e => setEmailNote(e.target.value)}
              placeholder="e.g. Your Q3 profit cycle has been credited."
              style={{ width: '100%', resize: 'vertical', marginBottom: 14 }}
            />

            {emailErr && (
              <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{emailErr}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" disabled={sending}
                onClick={() => setEmailOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={sending}
                style={{ width: 'auto', padding: '10px 22px' }}
                onClick={handleSend}>
                {sending ? 'Sending…' : 'Send email'}
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
    <AuthProvider>
      <ProtectedLayout requireAdmin>
        <MemberDetailContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}
