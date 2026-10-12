'use client';
// src/app/admin/page.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { adminAPI, formatEur, downloadBlob } from '@/lib/api';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';
import InvestmentsTab from '@/components/admin/InvestmentsTab';
import InvestmentRequestsTab from '@/components/admin/InvestmentRequestsTab';
import NotifBadge from '@/components/layout/NotifBadge';
import { openDocument } from '@/lib/openDocument';
import { useAdminAlerts } from '@/lib/adminAlerts';

function AdminContent() {
  const router = useRouter();
  const [stats,   setStats]   = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'pending' | 'requests' | 'investments'>('members');
  const { alerts, refresh: refreshAlerts } = useAdminAlerts();
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [showWallet,   setShowWallet]   = useState(false);
  const [showApprove,  setShowApprove]  = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Forms
  const [walletForm,   setWalletForm]   = useState({ investmentAmount:'', profitAmount:'' });
  const [approveForm,  setApproveForm]  = useState({ rejectReason:'', enableWallet:'true' });
  const [approveDocs,  setApproveDocs]  = useState<FileList | null>(null);
  const [formMsg,      setFormMsg]      = useState('');
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

  const loadAll = () => Promise.all([
    adminAPI.getStats().then(r => setStats(r.data)),
    adminAPI.getMembers().then(r => setMembers(r.data.members)),
    adminAPI.getPending().then(r => setPending(r.data.users)),
  ]).finally(() => { setLoading(false); refreshAlerts(); });

  useEffect(() => { loadAll(); }, []);

  const refreshMembers = () => {
    adminAPI.getMembers({ search }).then(r => setMembers(r.data.members));
    adminAPI.getPending().then(r => setPending(r.data.users));
    adminAPI.getStats().then(r => setStats(r.data));
    refreshAlerts();
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    adminAPI.getMembers({ search: val }).then(r => setMembers(r.data.members));
  };

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
        setFormMsg(`${selectedUser.name} activated successfully.`);
      } else {
        await adminAPI.rejectUser(selectedUser.id, approveForm.rejectReason);
        setFormMsg(`${selectedUser.name}'s application rejected.`);
      }
      setTimeout(() => { setShowApprove(false); setFormMsg(''); setApproveDocs(null); }, 2000);
      refreshMembers();
    } catch (err: any) {
      setFormMsg(err.response?.data?.error || 'Action failed.');
    }
  };

  // ── Add member (multi-step) ───────────────
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateAddStep = (step: number): string => {
    const f = addMemberForm;
    if (step === 1) {
      if (!f.email.trim() || !emailPattern.test(f.email.trim())) return 'Please enter a valid email address.';
      if (!f.mobile.trim()) return 'Mobile number is required.';
      if (!f.memberType) return 'Please select a member type.';
      return '';
    }
    if (step === 2) {
      if (!f.city.trim())    return 'City is required.';
      if (!f.country.trim()) return 'Country is required.';
      if (f.memberType === 'COMPANY') {
        if (!f.companyName.trim()) return 'Company name is required.';
        if (!addFiles.tradeLicense) return 'Company trade licence / registration certificate is required.';
      } else {
        if (!f.fullName.trim()) return 'Full name is required.';
        if (!addFiles.residentId) return 'Resident ID card is required.';
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
      setFormMsg(`${name} created. A welcome email with login details has been sent.`);
      setTimeout(() => {
        setShowAddMember(false);
        setFormMsg('');
        resetAddMemberWizard();
      }, 2500);
      refreshMembers();
    } catch (err: any) {
      setAddError(err.response?.data?.error || 'Failed to create member.');
    }
  };

  const handleUpdateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminAPI.updateWallet(selectedUser.id, walletForm);
    setFormMsg(res.data?.walletActivated
      ? 'Wallet enabled. The member has been emailed the balance it was activated with.'
      : 'Opening balance updated. The member will see the new values on their dashboard.');
    setTimeout(() => { setShowWallet(false); setFormMsg(''); }, 2000);
    refreshMembers();
    adminAPI.getStats().then(r => setStats(r.data));
  };

  const handleFreeze = async (id: string) => {
    await adminAPI.toggleFreeze(id);
    refreshMembers();
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
        <h1 className="page-title">Admin Panel</h1>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button className="export-btn" onClick={handleExport}>Export CSV</button>
         <a href="/admin/withdrawals" style={{
         padding: '8px 16px',
       background: 'rgba(224,82,82,0.12)',
       border: '1px solid rgba(224,82,82,0.3)',
       borderRadius: 'var(--radius-sm)',
      color: 'var(--red)',
      fontSize: 13,
      fontWeight: 600,
       display: 'flex',
      alignItems: 'center',
      gap: 6,
      textDecoration: 'none',
      }}>

    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
      stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7-7 7 7"/>
    </svg>
    Withdrawal Requests
  </a>


          <button
            className="btn-primary"
            style={{ width:'auto', padding:'8px 20px', fontSize:13, display:'flex', alignItems:'center', gap:6 }}
            onClick={() => { setFormMsg(''); resetAddMemberWizard(); setShowAddMember(true); }}
          >
            + Add Member
          </button>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="admin-grid">
        {[
          { label: 'Active Members',     value: stats?.totalMembers || 0 },
          { label: 'Pending Approvals',  value: stats?.pendingApprovals || 0, highlight: (stats?.pendingApprovals || 0) > 0 },
          { label: 'Total AUM',          value: formatEur(stats?.totalAUM || 0) },
          { label: 'Total Profit Paid',  value: formatEur(stats?.totalProfitDistributed || 0) },
          { label: 'Total Transactions', value: stats?.totalTransactions || 0 },
        ].map(s => (
          <div key={s.label} className="admin-stat-card"
            style={(s as any).highlight ? { borderColor: 'rgba(200,168,75,0.4)', background: 'rgba(200,168,75,0.06)' } : {}}>
            <p className="admin-stat-label">{s.label}</p>
            <p className="admin-stat-value"
              style={(s as any).highlight ? { color: 'var(--accent-gold)' } : {}}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Tab Switcher ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['members', 'pending', 'requests', 'investments'] as const).map(tab => (
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
            {tab === 'pending'
              ? 'Pending Approvals'
              : tab === 'requests' ? 'Investment Requests'
              : tab === 'investments' ? 'Project Investments' : 'Active Members'}
            {tab === 'pending'   && <NotifBadge count={alerts.newMembers} />}
            {tab === 'requests'  && <NotifBadge count={alerts.investmentRequests} />}
          </button>
        ))}
      </div>

      {/* ── Active Members Tab ── */}
      {activeTab === 'members' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
            <input className="filter-input" placeholder="Search members…"
              value={search} onChange={e => handleSearch(e.target.value)}
              style={{ flex:1, maxWidth:320 }} />
          </div>

          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Member</th><th>Email</th><th>Status</th><th>Wallet</th><th>Documents</th>
                  <th>Investment</th><th>Profit</th><th>Total Balance</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No members found.</td></tr>
                ) : members.map((m: any) => {
                  const docsComplete = (m.kycDocuments || []).some((d: any) => d.status === 'approved') || m.kycStatus === 'APPROVED';
                  return (
                  // The whole row opens the member's detail page; the action
                  // buttons stop the click so they stay usable from the list.
                  <tr key={m.id}
                    onClick={() => router.push(`/admin/members/detail?id=${m.id}`)}
                    style={{ cursor:'pointer' }}
                    title={`Open ${m.name}'s details`}>
                    <td style={{ fontWeight:600, color:'var(--text-primary)' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {m.name}
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none"
                          stroke="currentColor" strokeWidth="2" style={{ color:'var(--text-muted)' }}>
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </span>
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <span className={`badge ${m.status === 'ACTIVE' ? 'badge-completed' : 'badge-failed'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${m.walletEnabled ? 'badge-completed' : 'badge-pending'}`}>
                        {m.walletEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${docsComplete ? 'badge-completed' : 'badge-pending'}`}>
                        {docsComplete ? 'Complete' : 'Incomplete'}
                      </span>
                    </td>
                    <td>{formatEur(m.wallet?.investmentAmount || 0)}</td>
                    <td className="amount-credit">+{formatEur(m.wallet?.profitAmount || 0)}</td>
                    <td style={{ fontWeight:700, color:'var(--text-primary)' }}>{formatEur(m.wallet?.totalBalance || 0)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:6 }}>
                        {!m.walletEnabled && (
                          <button
                            style={{ padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
                              border:'1px solid rgba(58,111,255,0.3)', background:'rgba(58,111,255,0.1)', color:'var(--accent-blue)' }}
                            onClick={() => {
                              setSelectedUser(m);
                              setWalletForm({ investmentAmount: String(m.wallet?.openingCapital ?? 0), profitAmount: String(m.wallet?.openingProfit ?? 0) });
                              setFormMsg('');
                              setShowWallet(true);
                            }}>
                            Enable Wallet
                          </button>
                        )}
                        <button
                          style={{
                            padding:'4px 10px', fontSize:11, borderRadius:6, cursor:'pointer',
                            border:     m.status === 'FROZEN' ? '1px solid rgba(76,217,138,0.3)' : '1px solid rgba(224,82,82,0.3)',
                            background: m.status === 'FROZEN' ? 'rgba(76,217,138,0.1)'           : 'rgba(224,82,82,0.1)',
                            color:      m.status === 'FROZEN' ? 'var(--green)'                   : 'var(--red)',
                          }}
                          onClick={() => handleFreeze(m.id)}>
                          {m.status === 'FROZEN' ? 'Unfreeze' : 'Freeze'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Pending Approvals Tab ── */}
      {activeTab === 'pending' && (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Applicant</th><th>Type</th><th>Email</th><th>Company</th>
                <th>Docs</th><th>Applied</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  No pending applications.
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
                      {u.accountType === 'BUSINESS' ? 'Company' : 'Personal'}
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.profile?.company || <span style={{ color:'var(--text-muted)' }}>-</span>}</td>
                  <td>
                    <span className={`badge ${docCount > 0 ? 'badge-completed' : 'badge-failed'}`}>
                      {docCount > 0 ? `${docCount} uploaded` : 'None'}
                    </span>
                  </td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button
                        style={{
                          padding:'4px 12px', fontSize:11, borderRadius:6, cursor:'pointer',
                          border:'1px solid var(--border)', background:'transparent', color:'var(--text-secondary)',
                        }}
                        onClick={() => { setSelectedUser(u); setShowDetails(true); }}>
                        View Details
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
                        Activate Member
                      </button>
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
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Investment Requests Tab ── */}
      {activeTab === 'requests' && (
        <InvestmentRequestsTab onCompleted={loadAll} />
      )}

      {/* ── Project Investments Tab ── */}
      {activeTab === 'investments' && (
        <InvestmentsTab members={members} />
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
              <div><strong style={{ color:'var(--text-primary)' }}>Type:</strong> {selectedUser.accountType === 'BUSINESS' ? 'Company' : 'Personal'}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Email:</strong> {selectedUser.email}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Mobile:</strong> {selectedUser.profile?.phoneDialCode || ''} {selectedUser.profile?.phone || '-'}</div>
              {selectedUser.profile?.company && (
                <div><strong style={{ color:'var(--text-primary)' }}>Company:</strong> {selectedUser.profile.company}</div>
              )}
              <div><strong style={{ color:'var(--text-primary)' }}>Location:</strong> {selectedUser.profile?.city || '-'}, {selectedUser.profile?.country || '-'}</div>
              <div><strong style={{ color:'var(--text-primary)' }}>Applied:</strong> {new Date(selectedUser.createdAt).toLocaleString()}</div>
            </div>

            <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', marginBottom:8 }}>DOCUMENTS</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {[
                { label: 'Trade Licence / Registration Certificate', url: selectedUser.profile?.tradeLicenseUrl },
                { label: 'Resident ID Card',                         url: selectedUser.profile?.residentIdUrl },
                { label: 'Passport',                                 url: selectedUser.profile?.passportUrl },
                { label: 'Photo',                                    url: selectedUser.profilePhoto },
              ].map(doc => (
                <div key={doc.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12 }}>
                  <span style={{ color:'var(--text-secondary)' }}>{doc.label}</span>
                  {doc.url ? (
                    <button onClick={() => openDocument(doc.url)}
                      style={{
                        color:'var(--accent-blue)', fontWeight:600, fontSize:12, cursor:'pointer',
                        background:'none', border:'none', padding:0,
                      }}>
                      View
                    </button>
                  ) : (
                    <span style={{ color:'var(--text-muted)' }}>Not provided</span>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowDetails(false)}>
                Close
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
                Activate Member
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
              {approveMode === 'approve' ? `Activate Member - ${selectedUser.name}` : `Reject - ${selectedUser.name}`}
            </p>
            <form onSubmit={handleApproveOrReject}>
              {approveMode === 'approve' ? (
                <>
                <div className="form-group">
                  <label className="form-label">ENABLE WALLET</label>
                  <select className="filter-select" style={{ width:'100%' }}
                    value={approveForm.enableWallet}
                    onChange={e => setApproveForm(p => ({ ...p, enableWallet: e.target.value }))}>
                    <option value="true">Yes - activate wallet access</option>
                    <option value="false">No - keep wallet disabled for now</option>
                  </select>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                    This will activate the account and approve KYC. {approveForm.enableWallet === 'true' ? 'A wallet will be created and enabled.' : 'The wallet can be enabled later from the Active Members tab.'}
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">REQUIRED DOCUMENTS (optional)</label>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    className="form-input"
                    onChange={e => setApproveDocs(e.target.files)}
                  />
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                    Upload on behalf of the member now, or leave blank and complete later from the member&apos;s profile. This does not block activation.
                  </p>
                </div>
                </>
              ) : (
                <div className="form-group">
                  <label className="form-label">REJECTION REASON (optional)</label>
                  <input className="form-input" placeholder="e.g. Incomplete documentation"
                    value={approveForm.rejectReason}
                    onChange={e => setApproveForm(p => ({ ...p, rejectReason: e.target.value }))} />
                </div>
              )}
              {formMsg && (
                <p style={{ color: approveMode === 'approve' ? 'var(--green)' : 'var(--red)', fontSize:12, marginBottom:8 }}>
                  {formMsg}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowApprove(false)}>
                  Cancel
                </button>
                <button type="submit"
                  style={{
                    padding:'10px 24px', borderRadius:'var(--radius-sm)', fontSize:13, fontWeight:700,
                    background: approveMode === 'approve' ? 'rgba(76,217,138,0.2)' : 'rgba(224,82,82,0.2)',
                    border: approveMode === 'approve' ? '1px solid rgba(76,217,138,0.4)' : '1px solid rgba(224,82,82,0.4)',
                    color: approveMode === 'approve' ? 'var(--green)' : 'var(--red)',
                    cursor:'pointer',
                  }}>
                  {approveMode === 'approve' ? 'Activate Member' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Wallet Modal ── */}
      {showWallet && selectedUser && (
        <div className="modal-overlay" onClick={() => { setShowWallet(false); setFormMsg(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">Edit Opening Balance - {selectedUser.name}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16, marginTop:-10 }}>
              This is the manual balance carried over for this member, with no project behind it.
              Capital and profit booked against projects are tracked separately and are not edited here.
            </p>
            <form onSubmit={handleUpdateWallet}>
              <div className="form-group">
                <label className="form-label">OPENING CAPITAL (€)</label>
                <input className="form-input" type="number" min="0" step="0.01"
                  value={walletForm.investmentAmount}
                  onChange={e => setWalletForm(p => ({...p, investmentAmount:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">OPENING PROFIT (€)</label>
                <input className="form-input" type="number" min="0" step="0.01"
                  value={walletForm.profitAmount}
                  onChange={e => setWalletForm(p => ({...p, profitAmount:e.target.value}))} />
              </div>
              {/* Live total preview */}
              <div style={{
                background:   'rgba(58,111,255,0.06)',
                border:       '1px solid rgba(58,111,255,0.15)',
                borderRadius: 'var(--radius-sm)',
                padding:      '12px 14px',
                marginBottom: 16,
                display:      'flex',
                justifyContent:'space-between',
              }}>
                <div>
                  <span style={{ fontSize:12, color:'var(--text-muted)', display:'block' }}>New Total Balance</span>
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>
                    includes {formatEur(selectedUser.wallet?.projectCapital || 0)} project capital
                    and {formatEur(selectedUser.wallet?.projectProfit || 0)} project profit
                  </span>
                </div>
                <span style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>
                  {formatEur(
                    (parseFloat(walletForm.investmentAmount) || 0) +
                    (parseFloat(walletForm.profitAmount)     || 0) +
                    (selectedUser.wallet?.projectCapital     || 0) +
                    (selectedUser.wallet?.projectProfit      || 0)
                  )}
                </span>
              </div>
              {formMsg && (
                <p style={{ color:'var(--green)', fontSize:12, marginBottom:8 }}>{formMsg}</p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary"
                  onClick={() => { setShowWallet(false); setFormMsg(''); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary"
                  style={{ width:'auto', padding:'10px 24px' }}>
                  Update Wallet
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
            <p className="modal-title">Add Member</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:14, marginTop:-10 }}>
              A login will be generated and emailed to the member along with a temporary password.
            </p>

            {/* Step indicator */}
            <div style={{ display:'flex', gap:6, marginBottom:20 }}>
              {['Type & Contact', 'Details & Documents', 'Wallet & Review'].map((label, i) => {
                const n = i + 1;
                const active = addStep === n;
                const done   = addStep > n;
                return (
                  <div key={label} style={{ flex:1 }}>
                    <div style={{
                      height:4, borderRadius:2, marginBottom:6,
                      background: active || done ? 'var(--accent-gold, #c8a84b)' : 'var(--border)',
                    }} />
                    <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.03em',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      STEP {n} · {label.toUpperCase()}
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
                    <label className="form-label">MEMBER TYPE *</label>
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
                          {type === 'COMPANY' ? 'Company' : 'Personal'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">EMAIL *</label>
                    <input type="email" className="form-input" value={addMemberForm.email}
                      onChange={e => setAddMemberForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">MOBILE NUMBER *</label>
                    <div className="comm-phone-row">
                      <select
                        className="filter-select comm-phone-code"
                        value={addMobileCountry}
                        onChange={e => setAddMobileCountry(e.target.value)}
                        aria-label="Country dial code"
                      >
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.dial} · {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="form-input comm-phone-input"
                        type="tel"
                        inputMode="tel"
                        placeholder="Phone number"
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
                      <label className="form-label">COMPANY NAME *</label>
                      <input className="form-input" value={addMemberForm.companyName}
                        onChange={e => setAddMemberForm(p => ({ ...p, companyName: e.target.value }))} />
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">FULL NAME *</label>
                      <input className="form-input" value={addMemberForm.fullName}
                        onChange={e => setAddMemberForm(p => ({ ...p, fullName: e.target.value }))} />
                    </div>
                  )}

                  <div style={{ display:'flex', gap:10 }}>
                    <div className="form-group" style={{ flex:1 }}>
                      <label className="form-label">CITY *</label>
                      <input className="form-input" value={addMemberForm.city}
                        onChange={e => setAddMemberForm(p => ({ ...p, city: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex:1 }}>
                      <label className="form-label">COUNTRY *</label>
                      <select className="filter-select" style={{ width:'100%' }}
                        value={addMemberForm.country}
                        onChange={e => setAddMemberForm(p => ({ ...p, country: e.target.value }))}>
                        <option value="">Select country…</option>
                        {COUNTRIES.map(c => (
                          <option key={c.code} value={c.name}>{c.flag} {c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', margin:'14px 0 6px' }}>
                    REQUIRED DOCUMENT *
                  </p>
                  {addMemberForm.memberType === 'COMPANY' ? (
                    <div className="form-group">
                      <label className="form-label">TRADE LICENCE / REGISTRATION CERTIFICATE *</label>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                        onChange={e => setAddFiles(p => ({ ...p, tradeLicense: e.target.files?.[0] }))} />
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">RESIDENT ID CARD *</label>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                        onChange={e => setAddFiles(p => ({ ...p, residentId: e.target.files?.[0] }))} />
                    </div>
                  )}

                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', margin:'14px 0 6px' }}>
                    OPTIONAL DOCUMENTS
                  </p>
                  <div className="form-group">
                    <label className="form-label">PASSPORT</label>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                      onChange={e => setAddFiles(p => ({ ...p, passport: e.target.files?.[0] }))} />
                  </div>
                  {addMemberForm.memberType === 'COMPANY' && (
                    <div className="form-group">
                      <label className="form-label">RESIDENT ID CARD</label>
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="form-input"
                        onChange={e => setAddFiles(p => ({ ...p, residentId: e.target.files?.[0] }))} />
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">PHOTO</label>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" className="form-input"
                      onChange={e => setAddFiles(p => ({ ...p, photo: e.target.files?.[0] }))} />
                  </div>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                    Optional documents never block member creation and can be completed later from the member&apos;s profile.
                  </p>
                </>
              )}

              {/* ── Step 3: Wallet & review ── */}
              {addStep === 3 && (
                <>
                  <div className="form-group">
                    <label className="form-label">ENABLE WALLET *</label>
                    <select className="filter-select" style={{ width:'100%' }}
                      value={addMemberForm.enableWallet}
                      onChange={e => setAddMemberForm(p => ({ ...p, enableWallet: e.target.value }))}>
                      <option value="false">No - create member without a wallet</option>
                      <option value="true">Yes - activate wallet immediately</option>
                    </select>
                  </div>
                  {addMemberForm.enableWallet === 'true' && (
                    <div style={{ display:'flex', gap:10 }}>
                      <div className="form-group" style={{ flex:1 }}>
                        <label className="form-label">INITIAL INVESTMENT (€)</label>
                        <input className="form-input" type="number" min="0" step="0.01"
                          value={addMemberForm.investmentAmount}
                          onChange={e => setAddMemberForm(p => ({ ...p, investmentAmount: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ flex:1 }}>
                        <label className="form-label">INITIAL PROFIT (€)</label>
                        <input className="form-input" type="number" min="0" step="0.01"
                          value={addMemberForm.profitAmount}
                          onChange={e => setAddMemberForm(p => ({ ...p, profitAmount: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize:11, fontWeight:700, color:'var(--text-secondary)', margin:'18px 0 8px' }}>
                    REVIEW
                  </p>
                  <div style={{
                    background:'rgba(255,255,255,0.03)', border:'1px solid var(--border)',
                    borderRadius:'var(--radius-sm)', padding:'12px 14px', fontSize:12, color:'var(--text-secondary)',
                    display:'flex', flexDirection:'column', gap:6,
                  }}>
                    <div><strong style={{ color:'var(--text-primary)' }}>Type:</strong> {addMemberForm.memberType === 'COMPANY' ? 'Company' : 'Personal'}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Name:</strong> {addMemberForm.memberType === 'COMPANY' ? addMemberForm.companyName : addMemberForm.fullName}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Email:</strong> {addMemberForm.email}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Mobile:</strong> {(COUNTRIES.find(c => c.code === addMobileCountry) || DEFAULT_COUNTRY).dial} {addMemberForm.mobile}</div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Location:</strong> {addMemberForm.city}, {addMemberForm.country}</div>
                    <div>
                      <strong style={{ color:'var(--text-primary)' }}>Documents:</strong>{' '}
                      {[
                        addMemberForm.memberType === 'COMPANY' && addFiles.tradeLicense && 'Trade Licence',
                        addFiles.residentId && 'Resident ID',
                        addFiles.passport && 'Passport',
                        addFiles.photo && 'Photo',
                      ].filter(Boolean).join(', ') || 'None uploaded'}
                    </div>
                    <div><strong style={{ color:'var(--text-primary)' }}>Wallet:</strong> {addMemberForm.enableWallet === 'true' ? 'Enabled' : 'Disabled'}</div>
                  </div>
                </>
              )}

              {addError && (
                <p style={{ color:'var(--red)', fontSize:12, marginTop:12 }}>{addError}</p>
              )}
              {formMsg && (
                <p style={{ color: formMsg.includes('Failed') ? 'var(--red)' : 'var(--green)', fontSize:12, marginTop:12 }}>
                  {formMsg}
                </p>
              )}

              <div className="modal-actions">
                {addStep === 1 ? (
                  <button type="button" className="btn-secondary"
                    onClick={() => { setShowAddMember(false); setFormMsg(''); }}>
                    Cancel
                  </button>
                ) : (
                  <button type="button" className="btn-secondary" onClick={goAddBack}>
                    Back
                  </button>
                )}
                {addStep < 3 ? (
                  <button type="button" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}
                    onClick={goAddNext}>
                    Next
                  </button>
                ) : (
                  <button type="submit" className="btn-primary" style={{ width:'auto', padding:'10px 24px' }}>
                    Create Member
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
    <AuthProvider>
      <ProtectedLayout requireAdmin>
        <AdminContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}
