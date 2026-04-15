'use client';
// src/app/admin/page.tsx
import { useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { adminAPI, systemAPI, formatEur, downloadBlob } from '@/lib/api';

function AdminContent() {
  const [stats,   setStats]   = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'pending'>('members');
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  // Dev notice
  const [noticeText,    setNoticeText]    = useState('');
  const [noticeSaved,   setNoticeSaved]   = useState(false);
  const [noticeLoading, setNoticeLoading] = useState(false);

  // Modals
  const [showAddTx,    setShowAddTx]    = useState(false);
  const [showWallet,   setShowWallet]   = useState(false);
  const [showApprove,  setShowApprove]  = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Forms
  const [txForm,       setTxForm]       = useState({ userId:'', type:'CREDIT',category:'INVESTMENT', description:'', amount:'' });
  const [walletForm,   setWalletForm]   = useState({ investmentAmount:'', profitAmount:'' });
  const [approveForm,  setApproveForm]  = useState({ membershipTier:'BASIC', rejectReason:'' });
  const [formMsg,      setFormMsg]      = useState('');
  const [approveMode,  setApproveMode]  = useState<'approve' | 'reject'>('approve');

  const loadAll = () => Promise.all([
    adminAPI.getStats().then(r => setStats(r.data)),
    adminAPI.getMembers().then(r => setMembers(r.data.members)),
    adminAPI.getPending().then(r => setPending(r.data.users)),
    systemAPI.getNotice().then(r => setNoticeText(r.data?.text || '')),
  ]).finally(() => setLoading(false));

  useEffect(() => { loadAll(); }, []);

  const refreshMembers = () => {
    adminAPI.getMembers({ search }).then(r => setMembers(r.data.members));
    adminAPI.getPending().then(r => setPending(r.data.users));
    adminAPI.getStats().then(r => setStats(r.data));
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
        await adminAPI.approveUser(selectedUser.id, { membershipTier: approveForm.membershipTier });
        setFormMsg(`${selectedUser.name} approved successfully.`);
      } else {
        await adminAPI.rejectUser(selectedUser.id, approveForm.rejectReason);
        setFormMsg(`${selectedUser.name}'s application rejected.`);
      }
      setTimeout(() => { setShowApprove(false); setFormMsg(''); }, 2000);
      refreshMembers();
    } catch (err: any) {
      setFormMsg(err.response?.data?.error || 'Action failed.');
    }
  };

  // ── Save dev notice text to DB ────────────
  const handleSaveNotice = async () => {
    setNoticeLoading(true);
    try {
      await systemAPI.updateNotice(noticeText);
      setNoticeSaved(true);
      setTimeout(() => setNoticeSaved(false), 3000);
    } catch {}
    setNoticeLoading(false);
  };

  const handleAddTx = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminAPI.addTransaction(txForm);
    setFormMsg('Transaction added successfully!');
    setTxForm({ userId:'', type:'CREDIT',category:'INVESTMENT', description:'', amount:'' });
    refreshMembers();
    adminAPI.getStats().then(r => setStats(r.data));
  };

  const handleUpdateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    await adminAPI.updateWallet(selectedUser.id, walletForm);
    setFormMsg('Wallet updated! Member will see new values on their dashboard.');
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

  
          {/* ADD MEMBER — visible but disabled.  */}
          <div style={{ position:'relative' }} title="Coming Soon — Full feature available in next release">
            <button
              disabled
              style={{
                padding:       '8px 20px',
                background:    'rgba(58,111,255,0.2)',
                border:        '1px solid rgba(58,111,255,0.2)',
                borderRadius:  'var(--radius-sm)',
                color:         'rgba(200,210,255,0.3)',
                fontSize:      13,
                fontWeight:    700,
                cursor:        'not-allowed',
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}
            >
              {/* Lock icon */}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
                stroke="rgba(200,210,255,0.35)" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              + Add Member
            </button>
            {/* Coming soon badge */}
            <span style={{
              position:      'absolute',
              top:           -8,
              right:         -8,
              background:    'rgba(195,120,0,0.85)',
              color:         '#fff',
              fontSize:      9,
              fontWeight:    700,
              padding:       '2px 6px',
              borderRadius:  10,
              letterSpacing: '0.05em',
              pointerEvents: 'none',
              whiteSpace:    'nowrap',
            }}>COMING SOON</span>
          </div>
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
        {(['members', 'pending'] as const).map(tab => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '9px 20px', fontSize: 13, fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              marginBottom: -1,
            }}>
            {tab === 'pending'
              ? `Pending Approvals${pending.length > 0 ? ` (${pending.length})` : ''}`
              : 'Active Members'}
          </button>
        ))}
      </div>

      {/* ── Dev Notice Editor ── */}
      <div style={{
        background:   'rgba(195,120,0,0.08)',
        border:       '1px solid rgba(195,120,0,0.3)',
        borderRadius: 'var(--radius-md)',
        padding:      '18px 20px',
        marginBottom: 4,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
            stroke="#f59e0b" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9"  x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <p style={{ fontSize:13, fontWeight:700, color:'#f59e0b' }}>
            Development Notice (shown on all pages — stored in DB)
          </p>
        </div>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>
          This text appears in the top and bottom bars of every page. It is fetched directly from the
          database — editing HTML files won&apos;t remove it. Clear the field and save to hide it.
        </p>
        <div style={{ display:'flex', gap:10 }}>
          <input
            className="form-input"
            style={{ flex:1 }}
            value={noticeText}
            onChange={e => setNoticeText(e.target.value)}
            placeholder="Enter notice text… (leave empty to hide)"
          />
          <button
            className="btn-primary"
            style={{ width:'auto', padding:'0 20px', fontSize:13, flexShrink:0 }}
            onClick={handleSaveNotice}
            disabled={noticeLoading}
          >
            {noticeLoading ? 'Saving…' : noticeSaved ? '✓ Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Active Members Tab ── */}
      {activeTab === 'members' && (
        <>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
            <input className="filter-input" placeholder="Search members…"
              value={search} onChange={e => handleSearch(e.target.value)}
              style={{ flex:1, maxWidth:320 }} />
            <button className="export-btn" onClick={() => { setShowAddTx(true); setFormMsg(''); }}>
              + Add Transaction
            </button>
          </div>

          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Member</th><th>Email</th><th>Status</th>
                  <th>Investment</th><th>Profit</th><th>Total Balance</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>No members found.</td></tr>
                ) : members.map((m: any) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{m.name}</td>
                    <td>{m.email}</td>
                    <td>
                      <span className={`badge ${m.status === 'ACTIVE' ? 'badge-completed' : 'badge-failed'}`}>
                        {m.status}
                      </span>
                    </td>
                    <td>{formatEur(m.wallet?.investmentAmount || 0)}</td>
                    <td className="amount-credit">+{formatEur(m.wallet?.profitAmount || 0)}</td>
                    <td style={{ fontWeight:700, color:'var(--text-primary)' }}>{formatEur(m.wallet?.totalBalance || 0)}</td>
                    <td>
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
                    </td>
                  </tr>
                ))}
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
                <th>Applicant</th><th>Email</th><th>Company</th>
                <th>KYC Status</th><th>Docs</th><th>Applied</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:32, color:'var(--text-muted)' }}>
                  No pending applications.
                </td></tr>
              ) : pending.map((u: any) => (
                <tr key={u.id}>
                  <td style={{ fontWeight:600, color:'var(--text-primary)' }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.profile?.company || <span style={{ color:'var(--text-muted)' }}>—</span>}</td>
                  <td>
                    <span className={`badge ${
                      u.kycStatus === 'PENDING'       ? 'badge-pending' :
                      u.kycStatus === 'NOT_SUBMITTED' ? 'badge-failed'  : 'badge-completed'
                    }`}>
                      {u.kycStatus === 'NOT_SUBMITTED' ? 'Not Submitted' : u.kycStatus}
                    </span>
                  </td>
                  <td>{u.kycDocuments?.length || 0}</td>
                  <td style={{ color:'var(--text-muted)', fontSize:12 }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:6 }}>
                      <button
                        style={{
                          padding:'4px 12px', fontSize:11, borderRadius:6, cursor:'pointer',
                          border:'1px solid rgba(76,217,138,0.3)',
                          background:'rgba(76,217,138,0.1)', color:'var(--green)',
                        }}
                        onClick={() => {
                          setSelectedUser(u);
                          setApproveMode('approve');
                          setApproveForm({ membershipTier:'BASIC', rejectReason:'' });
                          setFormMsg('');
                          setShowApprove(true);
                        }}>
                        Approve
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
                          setApproveForm({ membershipTier:'BASIC', rejectReason:'' });
                          setFormMsg('');
                          setShowApprove(true);
                        }}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showAddTx && (
        <div className="modal-overlay" onClick={() => setShowAddTx(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">Add Manual Transaction</p>
            <form onSubmit={handleAddTx}>
              <div className="form-group">
                <label className="form-label">MEMBER</label>
                <select className="filter-select" style={{ width:'100%' }}
                  value={txForm.userId}
                  onChange={e => setTxForm(p => ({...p, userId:e.target.value}))} required>
                  <option value="">Select member…</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name} — {m.email}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">TYPE</label>
                <select className="filter-select" style={{ width:'100%' }}
                  value={txForm.type}
                  onChange={e => setTxForm(p => ({...p, type:e.target.value}))}>
                  <option value="CREDIT">Credit (money in)</option>
                  <option value="DEBIT">Debit (money out)</option>
                </select>
              </div>

    <div className="form-group">
      <label className="form-label">CATEGORY</label>
        <select className="filter-select" style={{ width:'100%' }} value={txForm.category}
          onChange={e => {
            const category = e.target.value;
            let type = "CREDIT";
            if (category === "WITHDRAWAL" || category === "ADMIN_DEBIT") { type = "DEBIT";
            }
            setTxForm(p => ({...p, category, type, }));
            }}
          >
       <option value="INVESTMENT">Investment</option>
        <option value="PROFIT">Profit</option>
        <option value="WITHDRAWAL">Withdrawal</option>
       <option value="ADMIN_DEBIT">Deduction</option>
    </select>
  </div>

              <div className="form-group">
                <label className="form-label">DESCRIPTION</label>
                <input required className="form-input" value={txForm.description}
                  placeholder="e.g. Q1 Profit Distribution"
                  onChange={e => setTxForm(p => ({...p, description:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">AMOUNT (€)</label>
                <input required className="form-input" type="number" min="0.01" step="0.01"
                  value={txForm.amount}
                  onChange={e => setTxForm(p => ({...p, amount:e.target.value}))} />
              </div>
              {formMsg && (
                <p style={{ color:'var(--green)', fontSize:12, marginBottom:8 }}>{formMsg}</p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary"
                  onClick={() => { setShowAddTx(false); setFormMsg(''); }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary"
                  style={{ width:'auto', padding:'10px 24px' }}>
                  Add Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Approve / Reject Modal ── */}
      {showApprove && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowApprove(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p className="modal-title">
              {approveMode === 'approve' ? `Approve — ${selectedUser.name}` : `Reject — ${selectedUser.name}`}
            </p>
            <form onSubmit={handleApproveOrReject}>
              {approveMode === 'approve' ? (
                <div className="form-group">
                  <label className="form-label">MEMBERSHIP TIER</label>
                  <select className="filter-select" style={{ width:'100%' }}
                    value={approveForm.membershipTier}
                    onChange={e => setApproveForm(p => ({ ...p, membershipTier: e.target.value }))}>
                    <option value="BASIC">Basic</option>
                    <option value="PREMIUM">Premium</option>
                    <option value="ENTERPRISE">Enterprise</option>
                    <option value="ELITE">Elite</option>
                  </select>
                  <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                    This will activate the account, approve KYC, and enable wallet access.
                  </p>
                </div>
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
                  {approveMode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
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
            <p className="modal-title">Edit Wallet — {selectedUser.name}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:16, marginTop:-10 }}>
              Changes will reflect immediately on the member&apos;s dashboard.
            </p>
            <form onSubmit={handleUpdateWallet}>
              <div className="form-group">
                <label className="form-label">INVESTMENT AMOUNT (€)</label>
                <input className="form-input" type="number" min="0" step="0.01"
                  value={walletForm.investmentAmount}
                  onChange={e => setWalletForm(p => ({...p, investmentAmount:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">PROFIT AMOUNT (€)</label>
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
                <span style={{ fontSize:12, color:'var(--text-muted)' }}>New Total Balance</span>
                <span style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)' }}>
                  {formatEur(
                    (parseFloat(walletForm.investmentAmount) || 0) +
                    (parseFloat(walletForm.profitAmount)     || 0)
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
