'use client';
// src/app/admin/super/page.tsx
//
// The super-admin panel: the actions an ADMIN deliberately cannot reach.
//
// Layout is a master/detail — a searchable list of every account on the left,
// the selected account's full record on the right. Unlike the admin Members
// tab this list is not limited to role MEMBER, because managing admins is the
// point of the page.
//
// Every destructive control lives in the Danger zone at the bottom of the
// detail pane, below everything else, and each one states its consequence in
// the confirmation rather than asking "Are you sure?".
//
// Two further tabs sit beside the accounts:
//   Projects      every project in the portal, with the forced delete that the
//                 ordinary one on the project form cannot do.
//   Notifications where new-member application alerts are emailed.
//   API keys     credentials for machine callers of the event feed. Here
//                rather than in the admin panel because a key is a standing
//                grant to read member data with no session attached.

import { useCallback, useEffect, useState } from 'react';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { superAdminAPI, formatDateTime } from '@/lib/api';
import { openDocument } from '@/lib/openDocument';
import { useAuth } from '@/lib/auth';
import SuperProjectsTab from '@/components/admin/SuperProjectsTab';
import SignupNotifyTab from '@/components/admin/SignupNotifyTab';
import ApiKeysTab from '@/components/admin/ApiKeysTab';

type Role = 'MEMBER' | 'ADMIN' | 'SUPER_ADMIN';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'PENDING' | 'FROZEN' | 'REJECTED';
  kycStatus: string;
  walletEnabled: boolean;
  profilePhoto: string | null;
  emailVerified: boolean;
  accountType: string | null;
  createdAt: string;
  deletedAt: string | null;
};

type KycDoc = {
  id: string;
  documentType: string;
  documentUrl: string;
  status: string;
  uploadedAt: string;
};

type FullUser = UserRow & {
  locale: string | null;
  profile: Record<string, any> | null;
  membership: Record<string, any> | null;
  kycDocuments: KycDoc[];
};

const ROLES: Role[] = ['MEMBER', 'ADMIN', 'SUPER_ADMIN'];
const STATUSES = ['ACTIVE', 'PENDING', 'FROZEN', 'REJECTED'] as const;
const KYC_STATUSES = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'] as const;

// The four identity documents, keyed by the `kind` the API expects. These are
// the Profile columns registered in the DOC branch of classifyStoredUrl, so
// they are readable only by their owner and an admin.
const DOCUMENT_KINDS = [
  { kind: 'passport',     label: 'Passport',      column: 'passportUrl' },
  { kind: 'residentId',   label: 'Resident ID',   column: 'residentIdUrl' },
  { kind: 'tradeLicense', label: 'Trade licence', column: 'tradeLicenseUrl' },
  { kind: 'cv',           label: 'CV',            column: 'cvUrl' },
];

// Grouped so the form reads like the member's own profile rather than a dump
// of columns in schema order.
const PROFILE_GROUPS: { title: string; fields: { key: string; label: string; type?: string }[] }[] = [
  { title: 'Contact', fields: [
    { key: 'phone',          label: 'Phone' },
    { key: 'phoneDialCode',  label: 'Dial code' },
    { key: 'phoneCountry',   label: 'Phone country (ISO)' },
    { key: 'country',        label: 'Country' },
    { key: 'city',           label: 'City' },
  ]},
  { title: 'Professional', fields: [
    { key: 'company',         label: 'Company' },
    { key: 'industry',        label: 'Industry' },
    { key: 'jobTitle',        label: 'Job title' },
    { key: 'experienceYears', label: 'Years of experience', type: 'number' },
    { key: 'linkedIn',        label: 'LinkedIn' },
    { key: 'website',         label: 'Website' },
  ]},
  { title: 'Business', fields: [
    { key: 'vatNumber',       label: 'VAT number' },
    { key: 'billingAddress',  label: 'Billing address' },
    { key: 'businessAddress', label: 'Business address' },
  ]},
];

const CARD: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 18,
};

const LABEL: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6, display: 'block',
};

function SuperAdminContent() {
  const { user: me } = useAuth();

  const [tab, setTab] = useState<'users' | 'projects' | 'notifications' | 'apikeys'>('users');

  const [rows,    setRows]    = useState<UserRow[]>([]);
  const [search,  setSearch]  = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState<FullUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [form, setForm]       = useState<Record<string, any>>({});
  const [profileForm, setProfileForm]       = useState<Record<string, any>>({});
  const [membershipForm, setMembershipForm] = useState<Record<string, any>>({});

  const [busy,   setBusy]   = useState('');
  const [notice, setNotice] = useState('');
  const [error,  setError]  = useState('');

  // Shown once, never recoverable: a directly-set password is not logged.
  const [issuedPassword, setIssuedPassword] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim())  params.search = search.trim();
      if (roleFilter)     params.role = roleFilter;
      if (includeDeleted) params.includeDeleted = '1';
      const res = await superAdminAPI.listUsers(params);
      setRows(res.data.users || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load the account list.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, includeDeleted]);

  useEffect(() => { loadList(); }, [loadList]);

  const openUser = async (id: string) => {
    setDetailLoading(true);
    setNotice(''); setError(''); setIssuedPassword('');
    try {
      const res = await superAdminAPI.getUser(id);
      const u: FullUser = res.data.user;
      setSelected(u);
      setForm({
        name: u.name ?? '', status: u.status, kycStatus: u.kycStatus,
        walletEnabled: u.walletEnabled, emailVerified: u.emailVerified,
        accountType: u.accountType ?? '', locale: u.locale ?? '',
      });
      setProfileForm({ ...(u.profile || {}) });
      setMembershipForm({ ...(u.membership || {}) });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not load that account.');
    } finally {
      setDetailLoading(false);
    }
  };

  /** Run one privileged action with consistent busy/notice/error handling. */
  const run = async (key: string, fn: () => Promise<any>, success: string) => {
    setBusy(key); setNotice(''); setError('');
    try {
      await fn();
      setNotice(success);
      await loadList();
      if (selected) await openUser(selected.id);
      return true;
    } catch (err: any) {
      setError(err?.response?.data?.error || 'That action could not be completed.');
      return false;
    } finally {
      setBusy('');
    }
  };

  const saveRecord = async () => {
    if (!selected) return;
    await run('save', () => superAdminAPI.updateUser(selected.id, {
      ...form,
      // Empty select values mean "not set", not the empty string.
      accountType: form.accountType || null,
      locale:      form.locale || null,
      profile:     profileForm,
      membership:  membershipForm,
    }), 'Record saved.');
  };

  const changeEmail = async () => {
    if (!selected) return;
    const next = window.prompt(
      `New sign-in email for ${selected.name}.\n\n`
      + 'Both the old and the new address are emailed about the change.',
      selected.email,
    );
    if (!next || next === selected.email) return;
    await run('email', () => superAdminAPI.changeEmail(selected.id, next),
      `Email changed to ${next}. Both addresses were notified.`);
  };

  const sendResetLink = async () => {
    if (!selected) return;
    await run('reset-link', () => superAdminAPI.resetPassword(selected.id, { mode: 'link' }),
      `A reset code was emailed to ${selected.email}.`);
  };

  const setPasswordDirectly = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `Set a new password for ${selected.name} directly?\n\n`
      + 'Prefer the reset link unless this member cannot receive email — a '
      + 'generated password has to be handed over out of band, and it is shown '
      + 'only once.',
    );
    if (!ok) return;

    setBusy('reset-set'); setNotice(''); setError('');
    try {
      const res = await superAdminAPI.resetPassword(selected.id, { mode: 'set' });
      setIssuedPassword(res.data.password);
      setNotice('Password replaced. Copy it now — it is not stored anywhere.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not set that password.');
    } finally {
      setBusy('');
    }
  };

  const changeRole = async (role: Role) => {
    if (!selected || role === selected.role) return;
    const warning = role === 'SUPER_ADMIN'
      ? `\n\nA super admin can delete accounts, move money and change anyone's password — including yours.`
      : '';
    if (!window.confirm(`Change ${selected.name} from ${selected.role} to ${role}?${warning}`)) return;
    await run('role', () => superAdminAPI.setRole(selected.id, role),
      `${selected.name} is now ${role}.`);
  };

  const deleteUser = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `Delete ${selected.name}?\n\n`
      + 'The account disappears from the portal and can no longer sign in. '
      + 'The record is kept, so this can be undone and the ledger stays intact.',
    );
    if (!ok) return;
    await run('delete', () => superAdminAPI.deleteUser(selected.id),
      `${selected.name} was deleted. You can restore the account from this page.`);
  };

  const restoreUser = async () => {
    if (!selected) return;
    await run('restore', () => superAdminAPI.restoreUser(selected.id),
      `${selected.name} was restored.`);
  };

  const purgeUser = async () => {
    if (!selected) return;
    const typed = window.prompt(
      `PERMANENTLY destroy ${selected.name}?\n\n`
      + 'The record, the profile, every identity document and every uploaded '
      + 'file are destroyed. This cannot be undone and the email address '
      + 'becomes available again.\n\n'
      + `Type ${selected.email} to confirm.`,
    );
    if (!typed) return;
    const done = await run('purge', () => superAdminAPI.purgeUser(selected.id, typed),
      `${selected.name} was permanently purged.`);
    if (done) setSelected(null);
  };

  const impersonate = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `View the portal as ${selected.name}?\n\n`
      + 'Read-only for 30 minutes — every change is refused while impersonating, '
      + 'and the session is recorded in the activity log.\n\n'
      + 'You will need to sign in again afterwards to get your own session back.',
    );
    if (!ok) return;
    try {
      const res = await superAdminAPI.impersonate(selected.id);
      // Deliberately explicit rather than silently swapping the stored token:
      // the token belongs to the member, and the operator should know their
      // own session is being set aside.
      window.localStorage.setItem('tbc_token', res.data.token);
      window.location.href = '/community';
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not start impersonation.');
    }
  };

  const uploadDocument = async (kind: string, file: File) => {
    if (!selected) return;
    await run(`doc-${kind}`, () => superAdminAPI.uploadDocument(selected.id, kind, file),
      'Document uploaded.');
  };

  const deleteDocument = async (kind: string, label: string) => {
    if (!selected) return;
    if (!window.confirm(`Delete this member's ${label}? The file is removed from disk.`)) return;
    await run(`doc-${kind}`, () => superAdminAPI.deleteDocument(selected.id, kind),
      `${label} deleted.`);
  };

  return (
    <div className="content-left">
      <div className="page-header">
        <h1 className="page-title">Super Admin</h1>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Full edit access. Every action on this page is recorded with your name.
        </span>
      </div>

      {/* Same underline-tab idiom as the admin panel's own tabs. */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)',
                    marginBottom: 18 }}>
        {([['users', 'Accounts'], ['projects', 'Projects'],
           ['notifications', 'Notifications'], ['apikeys', 'API keys']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '9px 16px', fontSize: 13, cursor: 'pointer', background: 'none',
              border: 'none', fontWeight: tab === key ? 600 : 500,
              borderBottom: tab === key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: tab === key ? 'var(--text-primary)' : 'var(--text-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {(notice || error) && (
        <div style={{
          ...CARD, marginBottom: 16, padding: '12px 16px', fontSize: 13,
          borderColor: error ? 'rgba(224,82,82,0.4)' : 'rgba(76,217,138,0.4)',
          color: error ? 'var(--red)' : 'var(--green)',
        }}>
          {error || notice}
        </div>
      )}

      {issuedPassword && (
        <div style={{ ...CARD, marginBottom: 16, borderColor: 'rgba(197,164,74,0.5)' }}>
          <span style={LABEL}>New password — shown once</span>
          <code style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.04em' }}>
            {issuedPassword}
          </code>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
            Not stored and not logged. Hand it over now, and have the member change it.
          </p>
        </div>
      )}

      {tab === 'users' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 18, alignItems: 'start' }}>

        {/* ── Accounts ── */}
        <div style={CARD}>
          <span style={LABEL}>Accounts</span>
          <input className="form-input" placeholder="Search name or email"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {(['', ...ROLES] as const).map((r) => (
              <button key={r || 'all'} onClick={() => setRoleFilter(r as '' | Role)}
                style={{
                  padding: '3px 9px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: roleFilter === r ? 'rgba(197,164,74,0.15)' : 'none',
                  color: roleFilter === r ? 'var(--gold, #c5a44a)' : 'var(--text-muted)',
                }}>
                {r === '' ? 'All' : r === 'SUPER_ADMIN' ? 'Super' : r.charAt(0) + r.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex',
                          gap: 6, alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)} />
            Show deleted accounts
          </label>

          {loading ? <div className="spinner" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '60vh', overflowY: 'auto' }}>
              {rows.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No accounts match.</p>
              )}
              {rows.map((r) => (
                <button key={r.id} onClick={() => openUser(r.id)}
                  style={{
                    textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid ' + (selected?.id === r.id ? 'var(--gold, #c5a44a)' : 'transparent'),
                    background: selected?.id === r.id ? 'rgba(197,164,74,0.08)' : 'none',
                    opacity: r.deletedAt ? 0.55 : 1,
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {r.name}
                    {r.deletedAt && <span style={{ color: 'var(--red)', fontWeight: 400 }}> · deleted</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {r.email} · {r.role === 'SUPER_ADMIN' ? 'Super admin' : r.role.toLowerCase()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Detail ── */}
        {!selected ? (
          <div style={{ ...CARD, color: 'var(--text-muted)', fontSize: 13 }}>
            Pick an account to edit its record, documents, role and credentials.
          </div>
        ) : detailLoading ? (
          <div style={CARD}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* ── Account ── */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: 17, margin: 0 }}>{selected.name}</h2>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {selected.email} · joined {formatDateTime(selected.createdAt)}
                  </p>
                </div>
                {selected.deletedAt && (
                  <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>
                    DELETED {formatDateTime(selected.deletedAt)}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                <div>
                  <span style={LABEL}>Name</span>
                  <input className="form-input" value={form.name ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <span style={LABEL}>Status</span>
                  <select className="form-input" value={form.status ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <span style={LABEL}>KYC status</span>
                  <select className="form-input" value={form.kycStatus ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, kycStatus: e.target.value }))}>
                    {KYC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <span style={LABEL}>Role</span>
                  <select className="form-input" value={selected.role}
                    onChange={(e) => changeRole(e.target.value as Role)}
                    disabled={selected.id === me?.id}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {selected.id === me?.id && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                      You cannot change your own role.
                    </p>
                  )}
                </div>
                <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(form.walletEnabled)}
                    onChange={(e) => setForm((p) => ({ ...p, walletEnabled: e.target.checked }))} />
                  Wallet enabled
                </label>
                <label style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={Boolean(form.emailVerified)}
                    onChange={(e) => setForm((p) => ({ ...p, emailVerified: e.target.checked }))} />
                  Email verified
                </label>
              </div>
            </div>

            {/* ── Profile ── */}
            {PROFILE_GROUPS.map((group) => (
              <div key={group.title} style={CARD}>
                <span style={LABEL}>{group.title}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  {group.fields.map((f) => (
                    <div key={f.key}>
                      <span style={{ ...LABEL, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                        {f.label}
                      </span>
                      <input className="form-input" type={f.type || 'text'}
                        value={profileForm[f.key] ?? ''}
                        onChange={(e) => setProfileForm((p) => ({ ...p, [f.key]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={CARD}>
              <span style={LABEL}>Bio</span>
              <textarea className="form-input" rows={3} value={profileForm.bio ?? ''}
                onChange={(e) => setProfileForm((p) => ({ ...p, bio: e.target.value }))} />
            </div>

            {/* ── Membership ── */}
            <div style={CARD}>
              <span style={LABEL}>Membership</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                <div>
                  <span style={{ ...LABEL, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Status</span>
                  <input className="form-input" value={membershipForm.status ?? ''}
                    placeholder="ACTIVE | SUSPENDED | EXPIRED"
                    onChange={(e) => setMembershipForm((p) => ({ ...p, status: e.target.value }))} />
                </div>
                {['joinedAt', 'renewedAt', 'expiresAt'].map((key) => (
                  <div key={key}>
                    <span style={{ ...LABEL, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                      {key.replace(/At$/, '')}
                    </span>
                    <input className="form-input" type="date"
                      value={(membershipForm[key] || '').slice(0, 10)}
                      onChange={(e) => setMembershipForm((p) => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>

            <button className="pj-btn pj-btn-primary" onClick={saveRecord} disabled={busy === 'save'}
              style={{ alignSelf: 'flex-start' }}>
              {busy === 'save' ? 'Saving…' : 'Save record'}
            </button>

            {/* ── Documents ── */}
            <div style={CARD}>
              <span style={LABEL}>Identity documents</span>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Readable only by this member and an admin. Documents open through a
                short-lived signed URL, never a direct link.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {DOCUMENT_KINDS.map(({ kind, label, column }) => {
                  const url = selected.profile?.[column];
                  return (
                    <div key={kind} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, minWidth: 110 }}>{label}</span>
                      {url ? (
                        <>
                          <button className="pj-btn pj-btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                            onClick={() => openDocument(url)}>
                            View
                          </button>
                          <button className="pj-btn pj-btn-danger" style={{ padding: '4px 12px', fontSize: 12 }}
                            disabled={busy === `doc-${kind}`}
                            onClick={() => deleteDocument(kind, label)}>
                            Delete
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not on file</span>
                      )}
                      <label className="pj-btn pj-btn-ghost" style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                        {url ? 'Replace' : 'Upload'}
                        <input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) uploadDocument(kind, file);
                          }} />
                      </label>
                    </div>
                  );
                })}
              </div>

              {selected.kycDocuments?.length > 0 && (
                <>
                  <span style={{ ...LABEL, marginTop: 18 }}>KYC submissions</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selected.kycDocuments.map((doc) => (
                      <div key={doc.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, minWidth: 110 }}>{doc.documentType}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{doc.status}</span>
                        <button className="pj-btn pj-btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                          onClick={() => openDocument(doc.documentUrl)}>
                          View
                        </button>
                        {(['approved', 'rejected'] as const).map((s) => (
                          <button key={s} className="pj-btn pj-btn-ghost"
                            style={{ padding: '4px 12px', fontSize: 12 }}
                            disabled={doc.status === s}
                            onClick={() => run(`kyc-${doc.id}`,
                              () => superAdminAPI.reviewKycDocument(selected.id, doc.id, s),
                              `Document ${s}.`)}>
                            {s === 'approved' ? 'Approve' : 'Reject'}
                          </button>
                        ))}
                        <button className="pj-btn pj-btn-danger" style={{ padding: '4px 12px', fontSize: 12 }}
                          onClick={() => run(`kyc-${doc.id}`,
                            () => superAdminAPI.deleteKycDocument(selected.id, doc.id),
                            'KYC document deleted.')}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Credentials ── */}
            <div style={CARD}>
              <span style={LABEL}>Credentials</span>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                The member is emailed about any change here.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="pj-btn pj-btn-ghost" onClick={changeEmail} disabled={busy === 'email'}>
                  Change email
                </button>
                <button className="pj-btn pj-btn-ghost" onClick={sendResetLink} disabled={busy === 'reset-link'}>
                  {busy === 'reset-link' ? 'Sending…' : 'Send password reset link'}
                </button>
                <button className="pj-btn pj-btn-ghost" onClick={setPasswordDirectly} disabled={busy === 'reset-set'}>
                  Set a password directly
                </button>
              </div>
            </div>

            {/* ── Danger zone ── */}
            <div style={{ ...CARD, borderColor: 'rgba(224,82,82,0.35)' }}>
              <span style={{ ...LABEL, color: 'var(--red)' }}>Danger zone</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div>
                  <p style={{ fontSize: 13, margin: '0 0 6px' }}>
                    View the portal as this member — read-only, 30 minutes, logged.
                  </p>
                  <button className="pj-btn pj-btn-ghost" onClick={impersonate}
                    disabled={selected.role === 'SUPER_ADMIN' || Boolean(selected.deletedAt)}>
                    Impersonate
                  </button>
                </div>

                {selected.deletedAt ? (
                  <div>
                    <p style={{ fontSize: 13, margin: '0 0 6px' }}>
                      This account is deleted. Restoring it puts the member back exactly as they were.
                    </p>
                    <button className="pj-btn pj-btn-primary" onClick={restoreUser} disabled={busy === 'restore'}>
                      Restore account
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13, margin: '0 0 6px' }}>
                      Delete the account. It stops working immediately, the record is kept,
                      and this can be undone.
                    </p>
                    <button className="pj-btn pj-btn-danger" onClick={deleteUser}
                      disabled={busy === 'delete' || selected.id === me?.id}>
                      Delete account
                    </button>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <p style={{ fontSize: 13, margin: '0 0 6px' }}>
                    Purge permanently: the record, profile, every document and every
                    uploaded file. Cannot be undone, and frees the email address.
                  </p>
                  <button className="pj-btn pj-btn-danger" onClick={purgeUser}
                    disabled={busy === 'purge' || selected.id === me?.id}>
                    Purge permanently
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {tab === 'projects'      && <SuperProjectsTab />}
      {tab === 'notifications' && <SignupNotifyTab />}
      {tab === 'apikeys'       && <ApiKeysTab />}
    </div>
  );
}

export default function SuperAdminPage() {
  return (
    <ProtectedLayout requireAdmin requireSuperAdmin>
      <SuperAdminContent />
    </ProtectedLayout>
  );
}
