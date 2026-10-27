'use client';
// src/app/admin/page.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useTranslation } from 'react-i18next';
import { adminAPI, formatEur, formatNumber, formatDate, formatDateTime, downloadBlob } from '@/lib/api';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';
import InvestmentsTab from '@/components/admin/InvestmentsTab';
import InvestmentRequestsTab from '@/components/admin/InvestmentRequestsTab';
import EnquirySettingsTab from '@/components/admin/EnquirySettingsTab';
import OverviewTab from '@/components/admin/OverviewTab';
import NotifBadge from '@/components/layout/NotifBadge';
import { openDocument } from '@/lib/openDocument';
import { useAdminAlerts } from '@/lib/adminAlerts';
import { useAuth } from '@/lib/auth';
import { isSuperAdminRole } from '@/lib/roles';
import { useHashTab } from '@/lib/useHashTab';
import { usePagedList } from '@/lib/usePagedList';
import LoadMore from '@/components/layout/LoadMore';

// The tabs, in the order they are shown. Also what the sidebar links into:
// /admin#pending opens Approvals, so a deep link and a click land identically.
const ADMIN_TABS = ['overview', 'members', 'pending', 'requests', 'investments', 'enquiries'] as const;
type AdminTab = typeof ADMIN_TABS[number];

function AdminContent() {
  const { t } = useTranslation(['admin', 'common']);
  const router = useRouter();
  const { user } = useAuth();
  // The controls an ADMIN must not see at all. Rendering them and letting the
  // API return 403 would read as a bug rather than a boundary — see
  // src/lib/roles.ts.
  const isSuper = isSuperAdminRole(user?.role);
  const [stats,   setStats]   = useState<any>(null);
  // Overview first and by default: the panel now opens on what the portal is
  // worth and what moved, rather than on a member list that answers a question
  // nobody asked on arrival. The tab lives in the URL hash so the sidebar can
  // link to one and Back steps between them.
  const [activeTab, setActiveTab] = useHashTab<AdminTab>(ADMIN_TABS, 'overview');
  const { alerts, refresh: refreshAlerts } = useAdminAlerts();
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  // Rows per request. Both member endpoints have always paged — 20 by default
  // — and the panel used to render whatever the first response contained with
  // nothing on screen saying there was more, so a portal with 40 members
  // showed 20 and looked complete.
  const PAGE_SIZE = 25;

  // The search box re-keys the member list, so it is debounced: a key per
  // keystroke is a request per keystroke, most of which usePagedList would
  // then drop as stale.
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const membersList = usePagedList<any>({
    key: `members:${searchQuery}`,
    limit: PAGE_SIZE,
    load: ({ page, limit }) => adminAPI
      .getMembers({ ...(searchQuery ? { search: searchQuery } : {}), page: String(page), limit: String(limit) })
      .then(r => ({ items: r.data.members || [], total: r.data.pagination?.total ?? (r.data.members || []).length })),
  });
  const pendingList = usePagedList<any>({
    key: 'pending',
    limit: PAGE_SIZE,
    load: ({ page, limit }) => adminAPI
      .getPending({ page: String(page), limit: String(limit) })
      .then(r => ({ items: r.data.users || [], total: r.data.pagination?.total ?? (r.data.users || []).length })),
  });
  const members = membersList.items;
  const pending = pendingList.items;

  // The investment wizard's member dropdown is a plain <select>, so it needs
  // the whole roster rather than the page the list happens to be showing: it
  // used to be handed the same array as the table, which meant member 21 could
  // not be chosen at all. Fetched once, and only when that tab is opened.
  const [roster, setRoster] = useState<any[]>([]);
  useEffect(() => {
    if (activeTab !== 'investments' || roster.length > 0) return;
    adminAPI.getMembers({ limit: '1000' }).then(r => setRoster(r.data.members || [])).catch(() => {});
  }, [activeTab, roster.length]);

  // Modals
  const [showApprove,  setShowApprove]  = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Forms
  const [approveForm,  setApproveForm]  = useState({ rejectReason:'', enableWallet:'true' });
  const [approveDocs,  setApproveDocs]  = useState<FileList | null>(null);
  const [formMsg,      setFormMsg]      = useState('');
  // Whether `formMsg` is an error.
  //
  // This used to be inferred with `formMsg.includes('Failed')`, which only
  // worked while the message was English: the moment it is translated the
  // substring disappears and every failure renders in success green. The state
  // now carries the severity explicitly instead of it being recoverable from
  // the text.
  const [formMsgIsError, setFormMsgIsError] = useState(false);
  const [approveMode,  setApproveMode]  = useState<'approve' | 'reject'>('approve');

  // Add Member - multi-step wizard
  const [addStep, setAddStep] = useState(1);
  const [addError, setAddError] = useState('');
  const emptyAddMemberForm = {
    email: '', mobile: '', memberType: '' as '' | 'COMPANY' | 'PERSONAL',
    companyName: '', fullName: '', city: '', country: '',
    enableWallet: 'false', investmentAmount: '', profitAmount: '',
  };
  const [addMemberForm, setAddMemberForm] = useState(emptyAddMemberForm);
  const [addMobileCountry, setAddMobileCountry] = useState(DEFAULT_COUNTRY.code);
  const emptyAddFiles: { photo?: File; tradeLicense?: File; passport?: File; residentId?: File } = {};
  const [addFiles, setAddFiles] = useState(emptyAddFiles);

  const resetAddMemberWizard = () => {
    setAddStep(1);
    setAddError('');
    setAddMemberForm(emptyAddMemberForm);
    setAddMobileCountry(DEFAULT_COUNTRY.code);
    setAddFiles({});
  };

  // The two lists fetch themselves; this is the rest of the first paint.
  const loadAll = () => adminAPI.getStats()
    .then(r => setStats(r.data))
    .finally(() => { setLoading(false); refreshAlerts(); });

  useEffect(() => { loadAll(); }, []);

  // An action changed a row, so both lists go back to page one: a member who
  // was just activated moves between them.
  const refreshMembers = () => {
    membersList.reload();
    pendingList.reload();
    adminAPI.getStats().then(r => setStats(r.data));
    setRoster([]);
    refreshAlerts();
  };

  const handleSearch = (val: string) => setSearch(val);

  const handleApproveOrReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      if (approveMode === 'approve') {
        const fd = new FormData();
        fd.append('enableWallet', approveForm.enableWallet);
        if (approveDocs) {
          Array.from(approveDocs).forEach(file => fd.append('documents', file));
        }
        await adminAPI.approveUser(selectedUser.id, fd);
        setFormMsgIsError(false);
        setFormMsg(t('admin:approve.activated', { name: selectedUser.name }));
      } else {
        await adminAPI.rejectUser(selectedUser.id, approveForm.rejectReason);
        setFormMsgIsError(false);
        setFormMsg(t('admin:approve.rejected', { name: selectedUser.name }));
      }
      setTimeout(() => { setShowApprove(false); setFormMsg(''); setApproveDocs(null); }, 2000);
      refreshMembers();
    } catch (err: any) {
      setFormMsgIsError(true);
      setFormMsg(err.response?.data?.error || t('admin:approve.actionFailed'));
    }
  };

  // ── Add member (multi-step) ───────────────
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateAddStep = (step: number): string => {
    const f = addMemberForm;
    if (step === 1) {
      if (!f.email.trim() || !emailPattern.test(f.email.trim())) return t('admin:addMember.errors.email');
      if (!f.mobile.trim()) return t('admin:addMember.errors.mobile');
      if (!f.memberType) return t('admin:addMember.errors.memberType');
      return '';
    }
    if (step === 2) {
      if (!f.city.trim())    return t('admin:addMember.errors.city');
      if (!f.country.trim()) return t('admin:addMember.errors.country');
      if (f.memberType === 'COMPANY') {
        if (!f.companyName.trim()) return t('admin:addMember.errors.companyName');
        if (!addFiles.tradeLicense) return t('admin:addMember.errors.tradeLicense');
      } else {
        if (!f.fullName.trim()) return t('admin:addMember.errors.fullName');
        if (!addFiles.residentId) return t('admin:addMember.errors.residentId');
      }
      return '';
    }
    return '';
  };

  const goAddNext = () => {
    const err = validateAddStep(addStep);
    if (err) { setAddError(err); return; }
    setAddError('');
    setAddStep(s => Math.min(s + 1, 3));
  };

  const goAddBack = () => {
    setAddError('');
    setAddStep(s => Math.max(s - 1, 1));
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const step1Err = validateAddStep(1);
    const step2Err = validateAddStep(2);
    if (step1Err || step2Err) { setAddError(step1Err || step2Err); return; }

    try {
      const f = addMemberForm;
      const fd = new FormData();
      const dialCountry = COUNTRIES.find(c => c.code === addMobileCountry) || DEFAULT_COUNTRY;
      fd.append('memberType', f.memberType);
      fd.append('email', f.email.trim());
      fd.append('mobile', f.mobile.trim());
      fd.append('mobileCountry', dialCountry.code);
      fd.append('mobileDialCode', dialCountry.dial);
      fd.append('city', f.city.trim());
      fd.append('country', f.country.trim());
      if (f.memberType === 'COMPANY') fd.append('companyName', f.companyName.trim());
      else                            fd.append('fullName', f.fullName.trim());
      fd.append('enableWallet', f.enableWallet);
      if (f.enableWallet === 'true') {
        fd.append('investmentAmount', f.investmentAmount || '0');
        fd.append('profitAmount', f.profitAmount || '0');
      }
      if (addFiles.photo)        fd.append('photo', addFiles.photo);
      if (addFiles.tradeLicense) fd.append('tradeLicense', addFiles.tradeLicense);
      if (addFiles.passport)     fd.append('passport', addFiles.passport);
      if (addFiles.residentId)   fd.append('residentId', addFiles.residentId);

      const name = f.memberType === 'COMPANY' ? f.companyName : f.fullName;
      await adminAPI.createMember(fd);
      setFormMsgIsError(false);
      setFormMsg(t('admin:addMember.created', { name }));
      setTimeout(() => {
        setShowAddMember(false);
        setFormMsg('');
        resetAddMemberWizard();
      }, 2500);
      refreshMembers();
    } catch (err: any) {
      setAddError(err.response?.data?.error || t('admin:addMember.createFailed'));
    }
  };

  const handleExport = async () => {
    const res = await adminAPI.exportData();
    downloadBlob(res.data, `TBC-Members-${Date.now()}.csv`);
  };

  if (loading) return <div style={{ margin: 60, textAlign: 'center' }}><div className="spinner" /></div>;

  return (
    <div className="content-left">

      {/* ── Header ── */}
      <div className="page-header">
        <h1 className="page-title">{t('admin:title')}</h1>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* A full member export is bulk PII in one file. */}
          {isSuper && (
            <button className="export-btn" onClick={handleExport}>{t('admin:exportCsv')}</button>
          )}
         {/* The "Withdrawal Requests" link that used to sit here is gone: the
            sidebar has a Withdrawals row, with the pending count on it, which
            this button did not have. A second door to the same room is just a
            second thing to keep in step. */}


          <button
            className="btn-primary"
            style={{ width:'auto', padding:'8px 20px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            onClick={() => { setFormMsg(''); resetAddMemberWizard(); setShowAddMember(true); }}
          >
            {t('admin:addMemberCta')}
          </button>
        </div>
      </div>

      {/* The five flat stat cards that used to sit here are gone: the Overview
          tab below carries the same figures as KPI tiles, with the period they
          cover and the caveats they need. Two copies of one number is how the
          two drift. */}

      {/* ── Tab Switcher ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {ADMIN_TABS.map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', fontSize: 13, fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              marginBottom: -1,
            }}>
            {t(`admin:tabs.${tab}`)}
            {tab === 'pending'   && <NotifBadge count={alerts.newMembers} />}
            {tab === 'requests'  && <NotifBadge count={alerts.investmentRequests} />}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && <OverviewTab />}

      {/* ── Active Members Tab ── */}
      {activeTab === 'members' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
            <input className="filter-input" placeholder={t('admin:members.searchPlaceholder')}
              value={search} onChange={e => handleSearch(e.target.value)}
              style={{ flex:1, maxWidth:320 }} />
            {/* How many members there are, which the list itself cannot say:
                it holds the pages fetched so far, not the set. */}
            {!membersList.loading && (
              <span style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)' }}>
                {searchQuery
                  ? t('admin:members.matchingCount', { count: membersList.total })
                  : t('admin:members.totalCount', { count: membersList.total })}
              </span>
            )}
          </div>

          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>{t('admin:members.columns.member')}</th>
                  <th>{t('admin:members.columns.email')}</th>
                  <th>{t('admin:members.columns.wallet')}</th>
                  <th>{t('admin:members.columns.documents')}</th>
                  <th>{t('admin:members.columns.investment')}</th>
                  <th>{t('admin:members.columns.profit')}</th>
                  <th>{t('admin:members.columns.totalBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {membersList.loading ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>{t('common:state.loading')}</td></tr>
                ) : members.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>{t('admin:members.noneFound')}</td></tr>
                ) : members.map((m: any) => {
                  const docsComplete = (m.kycDocuments || []).some((d: any) => d.status === 'approved') || m.kycStatus === 'APPROVED';
                  return (
                  // The whole row opens the member's detail page; the action
                  // buttons stop the click so they stay usable from the list.
                  <tr key={m.id}
                    onClick={() => router.push(`/admin/members/detail?id=${m.id}`)}
                    style={{ cursor:'pointer' }}
                    title={t('admin:members.openRow', { name: m.name })}>
                    <td style={{ fontWeight:600, color:'var(--text-primary)' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {m.name}
                        {/* The Status column is gone; a frozen member is the
                            one state the list still has to surface, because a
                            frozen account cannot sign in. */}
                        {m.status === 'FROZEN' && (
                          <span className="badge badge-failed" style={{ fontSize:10, padding:'1px 6px' }}
                            title={t('admin:members.frozenNotice')}>
                            {t('common:status.frozen', { defaultValue: 'Frozen' })}
                          </span>
                        )}
                        {/* "Go deeper" chevron — directional, so it mirrors. */}
                        <svg className="rtl-mirror" viewBox="0 0 24 24" width="12" height="12" fill="none"
                          stroke="currentColor" strokeWidth="2" style={{ color:'var(--text-muted)' }}>
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </span>
                    </td>
                    <td className="ltr-embed">{m.email}</td>
                    <td>
                      <span className={`badge ${m.walletEnabled ? 'badge-completed' : 'badge-pending'}`}>
                        {m.walletEnabled ? t('admin:members.walletEnabled') : t('admin:members.walletDisabled')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${docsComplete ? 'badge-completed' : 'badge-pending'}`}>
                        {docsComplete ? t('admin:members.docsComplete') : t('admin:members.docsIncomplete')}
                      </span>
                    </td>
                    <td className="ltr-embed">{formatEur(m.wallet?.investmentAmount || 0)}</td>
                    <td className="amount-credit ltr-embed">+{formatEur(m.wallet?.profitAmount || 0)}</td>
                    <td className="ltr-embed" style={{ fontWeight:700, color:'var(--text-primary)' }}>{formatEur(m.wallet?.totalBalance || 0)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <LoadMore shown={members.length} total={membersList.total}
            hasMore={membersList.hasMore} loading={membersList.loadingMore}
            onMore={membersList.loadMore} />
        </>
      )}

      {/* ── Pending Approvals Tab ── */}
      {activeTab === 'pending' && (
        <>
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>{t('admin:pending.columns.applicant')}</th>
                <th>{t('admin:pending.columns.type')}</th>
                <th>{t('admin:pending.columns.email')}</th>
                <th>{t('admin:pending.columns.company')}</th>
                <th>{t('admin:pending.columns.docs')}</th>
                <th>{t('admin:pending.columns.applied')}</th>
                <th>{t('admin:pending.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pendingList.loading ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  {t('common:state.loading')}
                </td></tr>
              ) : pending.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  {t('admin:pending.noneFound')}
                </td></tr>
              ) : pending.map((u: any) => {
                const docCount = [
                  u.profile?.tradeLicenseUrl, u.profile?.residentIdUrl,
                  u.profile?.passportUrl, u.profilePhoto,
                ].filter(Boolean).length;
                return (
                <tr key={u.id}>
                  <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{u.name}</td>
                  <td>
                    <span className="badge badge-pending">
                      {u.accountType === 'BUSINESS' ? t('admin:pending.typeCompany') : t('admin:pending.typePersonal')}
                    </span>
                  </td>
                  <td className="ltr-embed">{u.email}</td>
                  <td>{u.profile?.company || <span style={{ color:'var(--text-muted)' }}>-</span>}</td>
                  <td>
                    <span className={`badge ${docCount > 0 ? 'badge-completed' : 'badge-failed'}`}>
                      {docCount > 0 ? t('admin:pending.docsUploaded', { count: docCount }) : t('admin:pending.docsNone')}
                    </span>
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>
                    {formatDate(u.createdAt)}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button
                        style={{
                          padding:'4px 12px', fontSize:11, borderRadius:6, cursor:'pointer',
                          border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)',
                        }}
                        onClick={() => { setSelectedUser(u); setShowDetails(true); }}>
                        {t('admin:pending.viewDetails')}
                      </button>
                      <button
                        style={{
                          padding:'4px 12px', fontSize:11, borderRadius:6, cursor:'pointer',
                          border:'1px solid rgba(76,217,138,0.3)',
                          background:'rgba(76,217,138,0.1)', color:'var(--green)',
                        }}
                        onClick={() => {
                          setSelectedUser(u);
                          setApproveMode('approve');
                          setApproveForm({ rejectReason:'', enableWallet:'true' });
                          setApproveDocs(null);
                          setFormMsg('');
                          setShowApprove(true);
                        }}>
                        {t('admin:pending.activate')}
                      </button>
                      {/* Rejection is terminal: REJECTED blocks login for
                          good, so only a super admin may do it. An admin
                          approves, or leaves the application pending. */}
                      {isSuper && (
                      <button
                        style={{
                          padding:'4px 12px', fontSize:11, borderRadius:6, cursor:'pointer',
                          border:'1px solid rgba(224,82,82,0.3)',
                          background:'rgba(224,82,82,0.1)', color:'var(--red)',
                        }}
                        onClick={() => {
                          setSelectedUser(u);
                          setApproveMode('reject');
                          setApproveForm({ rejectReason:'', enableWallet:'true' });
                          setFormMsg('');
                          setShowApprove(true);
                        }}>
                        {t('admin:pending.reject')}
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <LoadMore shown={pending.length} total={pendingList.total}
          hasMore={pendingList.hasMore} loading={pendingList.loadingMore}
          onMore={pendingList.loadMore} />
        </>
      )}

      {/* ── Investment Requests Tab ── */}
      {activeTab === 'requests' && (
        <InvestmentRequestsTab onCompleted={refreshMembers} />
      )}

      {/* ── Project Investments Tab ── */}
      {/* ── Enquiries: the portal-wide recipient, and the record of what was
             sent. One address for every project and company. ── */}
      {activeTab === 'enquiries' && <EnquirySettingsTab />}

      {activeTab === 'investments' && (
        <InvestmentsTab members={roster} />
      )}

      {/* ── Pending Applicant Details Modal ── */}
      {showDetails && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">{selectedUser.name}</p>
            <div style={{
              background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:12, color:'var(--text-secondary)',
              display:'flex', flexDirection:'column', gap:6, marginBottom:16,
            }}>
              <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:details.type')}</strong> {selectedUser.accountType === 'BUSINESS' ? t('admin:pending.typeCompany') : t('admin:pending.typePersonal')}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:details.email')}</strong> <span className="ltr-embed">{selectedUser.email}</span></div>
              {/* Dial code + number is a single LTR run even in RTL text. */}
              <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:details.mobile')}</strong> <span className="ltr-embed">{selectedUser.profile?.phoneDialCode || ''} {selectedUser.profile?.phone || '-'}</span></div>
              {selectedUser.profile?.company && (
                <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:details.company')}</strong> {selectedUser.profile.company}</div>
              )}
              <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:details.location')}</strong> {selectedUser.profile?.city || '-'}, {selectedUser.profile?.country || '-'}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:details.applied')}</strong> {formatDateTime(selectedUser.createdAt)}</div>
            </div>

            <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>{t('admin:details.documentsTitle')}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {[
                { key: 'tradeLicense', label: t('admin:details.docs.tradeLicense'), url: selectedUser.profile?.tradeLicenseUrl },
                { key: 'residentId',   label: t('admin:details.docs.residentId'),   url: selectedUser.profile?.residentIdUrl },
                { key: 'passport',     label: t('admin:details.docs.passport'),     url: selectedUser.profile?.passportUrl },
                { key: 'photo',        label: t('admin:details.docs.photo'),        url: selectedUser.profilePhoto },
              ].map(doc => (
                <div key={doc.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
                  <span style={{ color:'var(--text-secondary)' }}>{doc.label}</span>
                  {doc.url ? (
                    <button onClick={() => openDocument(doc.url)}
                      style={{
                        color:'var(--accent-blue)', fontWeight:600, fontSize:12, cursor:'pointer',
                        background:'none', border:'none', padding:0,
                      }}>
                      {t('admin:details.view')}
                    </button>
                  ) : (
                    <span style={{ color:'var(--text-muted)' }}>{t('admin:details.notProvided')}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowDetails(false)}>
                {t('common:action.close')}
              </button>
              <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
                onClick={() => {
                  setShowDetails(false);
                  setApproveMode('approve');
                  setApproveForm({ rejectReason:'', enableWallet:'true' });
                  setApproveDocs(null);
                  setFormMsg('');
                  setShowApprove(true);
                }}>
                {t('admin:pending.activate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Approve / Reject Modal ── */}
      {showApprove && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowApprove(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">
              {approveMode === 'approve'
                ? t('admin:approve.titleApprove', { name: selectedUser.name })
                : t('admin:approve.titleReject', { name: selectedUser.name })}
            </p>
            <form onSubmit={handleApproveOrReject}>
              {approveMode === 'approve' ? (
                <>
                <div className="form-group">
                  <label className="form-label">{t('admin:approve.enableWalletLabel')}</label>
                  <select className="filter-select" style={{ width:'100%' }}
                    value={approveForm.enableWallet}
                    onChange={e => setApproveForm(p => ({ ...p, enableWallet: e.target.value }))}>
                    <option value="true">{t('admin:approve.walletYes')}</option>
                    <option value="false">{t('admin:approve.walletNo')}</option>
                  </select>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                    {/* Two sentences, each its own key: in Italian, Russian,
                        Persian and Arabic the second clause does not simply
                        append to the first, so they are not concatenated
                        inside one string. */}
                    {t('admin:approve.noteBase')}{' '}
                    {approveForm.enableWallet === 'true'
                      ? t('admin:approve.noteWalletOn')
                      : t('admin:approve.noteWalletOff')}
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('admin:approve.documentsLabel')}</label>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="form-input"
                    onChange={e => setApproveDocs(e.target.files)}
                  />
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                    {t('admin:approve.documentsHint')}
                  </p>
                </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">{t('admin:approve.rejectReasonLabel')}</label>
                  <input className="form-input" placeholder={t('admin:approve.rejectReasonPlaceholder')}
                    value={approveForm.rejectReason}
                    onChange={e => setApproveForm(p => ({ ...p, rejectReason: e.target.value }))} />
                </div>
              )}
              {/* Severity comes from formMsgIsError, not from the mode: a
                  failed activation must render red even though the mode is
                  'approve'. */}
              {formMsg && (
                <p style={{ color: formMsgIsError ? 'var(--red)' : 'var(--green)', fontSize:12, marginBottom:8 }}>
                  {formMsg}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowApprove(false)}>
                  {t('common:action.cancel')}
                </button>
                <button type="submit"
                  style={{
                    padding:'10px 24px', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700,
                    background: approveMode === 'approve' ? 'rgba(76,217,138,0.2)' : 'rgba(224,82,82,0.2)',
                    border: approveMode === 'approve' ? '1px solid rgba(76,217,138,0.4)' : '1px solid rgba(224,82,82,0.4)',
                    color: approveMode === 'approve' ? 'var(--green)' : 'var(--red)',
                    cursor:'pointer',
                  }}>
                  {approveMode === 'approve' ? t('admin:approve.confirmActivate') : t('admin:approve.confirmReject')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Member Modal (multi-step) ── */}
      {showAddMember && (
        <div className="modal-overlay" onClick={() => { setShowAddMember(false); setFormMsg(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <p className="modal-title">{t('admin:addMember.title')}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14, marginTop:-10 }}>
              {t('admin:addMember.intro')}
            </p>

            {/* Step indicator */}
            <div style={{ display:'flex', gap:6, marginBottom:20 }}>
              {(['contact', 'details', 'wallet'] as const).map((stepKey, i) => {
                const label = t(`admin:addMember.steps.${stepKey}`);
                const n = i + 1;
                const active = addStep === n;
                const done   = addStep > n;
                return (
                  <div key={stepKey} style={{ flex:1 }}>
                    <div style={{
                      height:4, borderRadius:2, marginBottom:6,
                      background: active || done ? 'var(--accent-gold, #c8a84b)' : 'var(--border)',
                    }} />
                    <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.03em',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {/* The numeral is locale-formatted; the whole label is
                          one interpolated string so word order can change. */}
                      {t('admin:addMember.stepLabel', { number: formatNumber(n), label: label.toUpperCase() })}
                    </p>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleAddMember}>
              {/* ── Step 1: Member type & basic contact ── */}
              {addStep === 1 && (
                <>
                  <div className="form-group">
                    <label className="form-label">{t('admin:addMember.memberTypeLabel')}</label>
                    <div style={{ display:'flex', gap:10 }}>
                      {(['COMPANY', 'PERSONAL'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setAddMemberForm(p => ({ ...p, memberType: type }))}
                          style={{
                            flex:1, padding:'12px 10px', borderRadius:'var(--radius-sm)', cursor:'pointer',
                            border: addMemberForm.memberType === type ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                            background: addMemberForm.memberType === type ? 'rgba(58,111,255,0.1)' : 'transparent',
                            color: addMemberForm.memberType === type ? 'var(--accent-blue)' : 'var(--text-secondary)',
                            fontSize:13, fontWeight:700,
                          }}>
                          {type === 'COMPANY' ? t('admin:pending.typeCompany') : t('admin:pending.typePersonal')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('admin:addMember.emailLabel')}</label>
                    <input type="email" className="form-input" dir="ltr" value={addMemberForm.email}
                      onChange={e => setAddMemberForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('admin:addMember.mobileLabel')}</label>
                    <div className="comm-phone-row">
                      <select
                        className="filter-select comm-phone-code"
                        value={addMobileCountry}
                        onChange={e => setAddMobileCountry(e.target.value)}
                        aria-label={t('admin:addMember.dialCodeLabel')}
                      >
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.dial} · {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="form-input comm-phone-input ltr-embed"
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        placeholder={t('admin:addMember.mobilePlaceholder')}
                        value={addMemberForm.mobile}
                        onChange={e => setAddMemberForm(p => ({ ...p, mobile: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ── Step 2: Type-specific details & documents ── */}
              {addStep === 2 && (
                <>
                  {addMemberForm.memberType === 'COMPANY' ? (
                    <div className="form-group">
                      <label className="form-label">{t('admin:addMember.companyNameLabel')}</label>
                      <input className="form-input" value={addMemberForm.companyName}
                        onChange={e => setAddMemberForm(p => ({ ...p, companyName: e.target.value }))} />
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">{t('admin:addMember.fullNameLabel')}</label>
                      <input className="form-input" value={addMemberForm.fullName}
                        onChange={e => setAddMemberForm(p => ({ ...p, fullName: e.target.value }))} />
                    </div>
                  )}

                  <div style={{ display:'flex', gap:10 }}>
                    <div className="form-group" style={{ flex:1 }}>
                      <label className="form-label">{t('admin:addMember.cityLabel')}</label>
                      <input className="form-input" value={addMemberForm.city}
                        onChange={e => setAddMemberForm(p => ({ ...p, city: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex:1 }}>
                      <label className="form-label">{t('admin:addMember.countryLabel')}</label>
                      <select className="filter-select" style={{ width:'100%' }}
                        value={addMemberForm.country}
                        onChange={e => setAddMemberForm(p => ({ ...p, country: e.target.value }))}>
                        <option value="">{t('admin:addMember.countryPlaceholder')}</option>
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', margin:'14px 0 6px' }}>
                    {t('admin:addMember.requiredDocument')}
                  </p>
                  {addMemberForm.memberType === 'COMPANY' ? (
                    <div className="form-group">
                      <label className="form-label">{t('admin:addMember.tradeLicenseLabel')}</label>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                        onChange={e => setAddFiles(p => ({ ...p, tradeLicense: e.target.files?.[0] }))} />
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">{t('admin:addMember.residentIdRequiredLabel')}</label>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                        onChange={e => setAddFiles(p => ({ ...p, residentId: e.target.files?.[0] }))} />
                    </div>
                  )}

                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', margin:'14px 0 6px' }}>
                    {t('admin:addMember.optionalDocuments')}
                  </p>
                  <div className="form-group">
                    <label className="form-label">{t('admin:addMember.passportLabel')}</label>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                      onChange={e => setAddFiles(p => ({ ...p, passport: e.target.files?.[0] }))} />
                  </div>
                  {addMemberForm.memberType === 'COMPANY' && (
                    <div className="form-group">
                      <label className="form-label">{t('admin:addMember.residentIdLabel')}</label>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                        onChange={e => setAddFiles(p => ({ ...p, residentId: e.target.files?.[0] }))} />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">{t('admin:addMember.photoLabel')}</label>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" className="form-input"
                      onChange={e => setAddFiles(p => ({ ...p, photo: e.target.files?.[0] }))} />
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                    {t('admin:addMember.optionalNote')}
                  </p>
                </>
              )}

              {/* ── Step 3: Wallet & review ── */}
              {addStep === 3 && (
                <>
                  <div className="form-group">
                    <label className="form-label">{t('admin:addMember.enableWalletLabel')}</label>
                    <select className="filter-select" style={{ width:'100%' }}
                      value={addMemberForm.enableWallet}
                      onChange={e => setAddMemberForm(p => ({ ...p, enableWallet: e.target.value }))}>
                      <option value="false">{t('admin:addMember.walletNo')}</option>
                      <option value="true">{t('admin:addMember.walletYes')}</option>
                    </select>
                  </div>
                  {addMemberForm.enableWallet === 'true' && (
                    <div style={{ display:'flex', gap:10 }}>
                      <div className="form-group" style={{ flex:1 }}>
                        <label className="form-label">{t('admin:addMember.initialInvestment')}</label>
                        <input className="form-input" type="number" min="0" step="0.01"
                          value={addMemberForm.investmentAmount}
                          onChange={e => setAddMemberForm(p => ({ ...p, investmentAmount: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ flex:1 }}>
                        <label className="form-label">{t('admin:addMember.initialProfit')}</label>
                        <input className="form-input" type="number" min="0" step="0.01"
                          value={addMemberForm.profitAmount}
                          onChange={e => setAddMemberForm(p => ({ ...p, profitAmount: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', margin:'18px 0 8px' }}>
                    {t('admin:addMember.reviewTitle')}
                  </p>
                  <div style={{
                    background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)',
                    borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:12, color:'var(--text-secondary)',
                    display:'flex', flexDirection:'column', gap:6,
                  }}>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewType')}</strong> {addMemberForm.memberType === 'COMPANY' ? t('admin:pending.typeCompany') : t('admin:pending.typePersonal')}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewName')}</strong> {addMemberForm.memberType === 'COMPANY' ? addMemberForm.companyName : addMemberForm.fullName}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewEmail')}</strong> <span className="ltr-embed">{addMemberForm.email}</span></div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewMobile')}</strong> <span className="ltr-embed">{(COUNTRIES.find(c => c.code === addMobileCountry) || DEFAULT_COUNTRY).dial} {addMemberForm.mobile}</span></div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewLocation')}</strong> {addMemberForm.city}, {addMemberForm.country}</div>
                    <div>
                      <strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewDocuments')}</strong>{' '}
                      {/* Joined with the locale's own list separator rather
                          than a hardcoded ", " — Arabic uses "،". */}
                      {[
                        addMemberForm.memberType === 'COMPANY' && addFiles.tradeLicense && t('admin:addMember.docNames.tradeLicense'),
                        addFiles.residentId && t('admin:addMember.docNames.residentId'),
                        addFiles.passport && t('admin:addMember.docNames.passport'),
                        addFiles.photo && t('admin:addMember.docNames.photo'),
                      ].filter(Boolean).join(t('common:listSeparator')) || t('admin:addMember.noneUploaded')}
                    </div>
                    <div><strong style={{ color:'var(--text-primary)' }}>{t('admin:addMember.reviewWallet')}</strong> {addMemberForm.enableWallet === 'true' ? t('admin:members.walletEnabled') : t('admin:members.walletDisabled')}</div>
                  </div>
                </>
              )}

              {addError && (
                <p style={{ color:'var(--red)', fontSize:12, marginTop:12 }}>{addError}</p>
              )}
              {/* Replaces `formMsg.includes('Failed')`, which stopped working
                  the moment the message was translated. */}
              {formMsg && (
                <p style={{ color: formMsgIsError ? 'var(--red)' : 'var(--green)', fontSize:12, marginTop:12 }}>
                  {formMsg}
                </p>
              )}

              <div className="modal-actions">
                {addStep === 1 ? (
                  <button type="button" className="btn-secondary"
                    onClick={() => { setShowAddMember(false); setFormMsg(''); }}>
                    {t('common:action.cancel')}
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={goAddBack}>
                    {t('admin:addMember.back')}
                  </button>
                )}
                {addStep < 3 ? (
                  <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
                    onClick={goAddNext}>
                    {t('admin:addMember.next')}
                  </button>
                ) : (
                  <button type="submit" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}>
                    {t('admin:addMember.create')}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <ProtectedLayout requireAdmin>
      <AdminContent />
    </ProtectedLayout>
  );
}
