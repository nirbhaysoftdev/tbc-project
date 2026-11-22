'use client';
// src/app/settings/page.tsx
import { useState } from 'react';
import { COUNTRIES } from '@/lib/countries';
import { useTranslation } from 'react-i18next';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { profileAPI } from '@/lib/api';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { isAdminRole } from '@/lib/roles';

const API_URL = process.env.NODE_ENV === 'production' 
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';
  
const ADDRESS_KEYS = [
  { key: 'streetAddress', label: 'dashboard:settings.addressStreet' },
  { key: 'city',          label: 'dashboard:settings.addressCity' },
  { key: 'province',      label: 'dashboard:settings.addressProvince' },
  { key: 'state',         label: 'dashboard:settings.addressState' },
  { key: 'postalCode',    label: 'dashboard:settings.addressPostalCode' },
  { key: 'country',       label: 'dashboard:settings.addressCountry' },
];

function SettingsContent() {
  const { t } = useTranslation(['dashboard', 'common', 'validation']);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const { user, refresh } = useAuth();
  const [name,    setName]    = useState(user?.name || '');
  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [msg,     setMsg]     = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

  const [editingAddr, setEditingAddr] = useState(false);
  const [addrForm, setAddrForm] = useState<Record<string, string>>({});
  const [addrErr, setAddrErr] = useState('');
  const [addrSaving, setAddrSaving] = useState(false);

  const startAddrEdit = () => {
    const p = user?.profile;
    setAddrForm({
      streetAddress: p?.streetAddress || '', city: p?.city || '', province: p?.province || '',
      state: p?.state || '', postalCode: p?.postalCode || '', country: p?.country || '',
    });
    setAddrErr(''); setMsg('');
    setEditingAddr(true);
  };

  const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrErr('');
    const missing = ADDRESS_KEYS.find(k => !addrForm[k.key]?.trim());
    if (missing) return setAddrErr(t(`dashboard:settings.addressRequired`, { field: t(missing.label) }));
    setAddrSaving(true);
    try {
      await profileAPI.updateAddress(addrForm);
      await refresh();
      setEditingAddr(false);
      setMsg(t('dashboard:settings.addressUpdated'));
    } catch (e: any) {
      setAddrErr(e.response?.data?.error || t('dashboard:settings.updateFailed'));
    }
    setAddrSaving(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', name);
      if (photoFile) fd.append('photo', photoFile);
      if (curPwd && newPwd) { fd.append('currentPassword', curPwd); fd.append('newPassword', newPwd); }
      await profileAPI.update(fd);
      await refresh();
      setMsg(t('dashboard:settings.updated'));
      setCurPwd(''); setNewPwd('');
    } catch (e: any) {
      setErr(e.response?.data?.error || t('dashboard:settings.updateFailed'));
    }
    setLoading(false);
  };

  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;
  const p = user?.profile;
  const address = [
    { key: 'street',   label: t('dashboard:settings.addressStreet'),     value: p?.streetAddress },
    { key: 'city',     label: t('dashboard:settings.addressCity'),       value: p?.city },
    { key: 'province', label: t('dashboard:settings.addressProvince'),   value: p?.province },
    { key: 'state',    label: t('dashboard:settings.addressState'),      value: p?.state },
    { key: 'pin',      label: t('dashboard:settings.addressPostalCode'), value: p?.postalCode },
    { key: 'country',  label: t('dashboard:settings.addressCountry'),    value: p?.country },
  ];
  const initial  = user?.name?.charAt(0).toUpperCase() || '?';

  return (
    <div className="content-left" style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1 className="page-title">{t('dashboard:settings.title')}</h1>
      </div>

      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:28 }}>
        {/* Avatar preview */}
        <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:28, paddingBottom:20, borderBottom:'1px solid var(--border)' }}>
          <div className="sidebar-avatar" style={{ width:72, height:72, fontSize:24 }}>
            {photoUrl ? <img src={photoUrl} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
          </div>
          <div>
            <p style={{ fontWeight:700 }}>{user?.name}</p>
            <p className="ltr-embed" style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{user?.email}</p>
            <p style={{ fontSize:11, color:'var(--accent-blue)', marginTop:4, fontWeight:600 }}>
              {isAdminRole(user?.role) ? t('common:role.administrator') : t('common:role.member')}
            </p>
          </div>
        </div>

        {!isAdminRole(user?.role) && (
          <div style={{ marginBottom:28, paddingBottom:20, borderBottom:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'var(--text-secondary)' }}>
                {t('dashboard:settings.addressSection')}
              </p>
              {!editingAddr && (
                <button type="button" className="btn btn-ghost" style={{ fontSize:12 }} onClick={startAddrEdit}>
                  {t('dashboard:settings.addressEdit')}
                </button>
              )}
            </div>
            {editingAddr ? (
              <form onSubmit={saveAddress}>
                {ADDRESS_KEYS.map(({ key, label }) => (
                  <div className="form-group" key={key}>
                    <label className="form-label">{t(label)} *</label>
                    {key === 'country' ? (
                      <select className="form-input" value={addrForm.country || ''}
                        onChange={e => setAddrForm(p => ({ ...p, country: e.target.value }))}>
                        <option value="" />
                        {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.flag} {c.name}</option>)}
                      </select>
                    ) : (
                      <input className="form-input" value={addrForm[key] || ''}
                        onChange={e => setAddrForm(p => ({ ...p, [key]: e.target.value }))} />
                    )}
                  </div>
                ))}
                {addrErr && <p className="form-error">{addrErr}</p>}
                <div style={{ display:'flex', gap:10 }}>
                  <button type="submit" className="btn btn-primary" disabled={addrSaving}>
                    {t('dashboard:settings.addressSave')}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={addrSaving} onClick={() => setEditingAddr(false)}>
                    {t('dashboard:settings.addressCancel')}
                  </button>
                </div>
              </form>
            ) : address.some(a => a.value) ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:14 }}>
                {address.map(({ key, label, value }) => (
                  <div key={key}>
                    <p style={{ fontSize:11, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{label}</p>
                    <p style={{ fontSize:13, wordBreak:'break-word' }}>{value || '—'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize:12, color:'var(--text-muted)' }}>{t('dashboard:settings.addressNone')}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
    <label className="form-label">{t('dashboard:settings.profilePhoto')}</label>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
      {/* Current photo preview */}
      <div className="sidebar-avatar" style={{ width: 64, height: 64, fontSize: 20, flexShrink: 0 }}>
        {photoUrl ? <img src={photoUrl} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
      </div>
      <div>
        <input
          type="file"
          accept="image/*"
          id="photo-upload"
          style={{ display: 'none' }}
          onChange={e => setPhotoFile(e.target.files?.[0] || null)}
        />
        <label htmlFor="photo-upload" style={{
          padding:      '8px 16px',
          background:   'var(--bg-card)',
          border:       '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          cursor:       'pointer',
          fontSize:     12,
          color:        'var(--text-secondary)',
          display:      'inline-block',
        }}>
          {t('common:action.choosePhoto')}
        </label>
        {photoFile && (
          <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
            {t('validation:file.selected', { name: photoFile.name })}
          </p>
        )}
      </div>
    </div>
  </div>



          <div className="form-group">
            <label className="form-label">{t('dashboard:settings.displayName')}</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* Language lives with the other account preferences. Changing it
              here takes effect immediately and is written to the member's
              profile by the selector itself, so there is nothing to "save" and
              it sits outside the form's submit path (§5). */}
          <p style={{ fontSize:13, fontWeight:700, margin:'20px 0 8px', color:'var(--text-secondary)' }}>
            {t('dashboard:settings.languageSection')}
          </p>
          <div style={{ marginBottom: 20 }}>
            <LanguageSelector variant="panel" align="start" />
            <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:8, lineHeight:1.6 }}>
              {t('dashboard:settings.languageHint')}
            </p>
          </div>

          <p style={{ fontSize:13, fontWeight:700, margin:'20px 0 12px', color:'var(--text-secondary)' }}>{t('dashboard:settings.changePassword')}</p>
          <div className="form-group">
            <label className="form-label">{t('dashboard:settings.currentPassword')}</label>
            <input type="password" className="form-input" dir="ltr" value={curPwd} onChange={e => setCurPwd(e.target.value)} placeholder={t('dashboard:settings.keepUnchanged')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('dashboard:settings.newPassword')}</label>
            <input type="password" className="form-input" dir="ltr" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder={t('validation:password.min6')} />
          </div>

          {msg && <p style={{ color:'var(--green)', fontSize:13, marginBottom:12 }}>{msg}</p>}
          {err && <p className="form-error">{err}</p>}

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop:8 }}>
            {loading ? t('common:action.saving') : t('common:action.saveChanges')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedLayout>
      <SettingsContent />
    </ProtectedLayout>
  );
}
