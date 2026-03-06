'use client';
// src/app/settings/page.tsx
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import { useAuth } from '@/lib/auth';
import { profileAPI } from '@/lib/api';

const API_URL = process.env.NODE_ENV === 'production' 
  ? (process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '')
  : '';
  
function SettingsContent() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const { user, refresh } = useAuth();
  const [name,    setName]    = useState(user?.name || '');
  const [curPwd,  setCurPwd]  = useState('');
  const [newPwd,  setNewPwd]  = useState('');
  const [msg,     setMsg]     = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);

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
      setMsg('Profile updated successfully.');
      setCurPwd(''); setNewPwd('');
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Update failed.');
    }
    setLoading(false);
  };

  const photoUrl = user?.profilePhoto
    ? (user.profilePhoto.startsWith('http') ? user.profilePhoto : `${API_URL}${user.profilePhoto}`)
    : null;
  const initial  = user?.name?.charAt(0).toUpperCase() || '?';

  return (
    <div className="content-left" style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:28 }}>
        {/* Avatar preview */}
        <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:28, paddingBottom:20, borderBottom:'1px solid var(--border)' }}>
          <div className="sidebar-avatar" style={{ width:72, height:72, fontSize:24 }}>
            {photoUrl ? <img src={photoUrl} alt={user?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
          </div>
          <div>
            <p style={{ fontWeight:700 }}>{user?.name}</p>
            <p style={{ fontSize:12, color:'var(--text-muted)', marginTop:2 }}>{user?.email}</p>
            <p style={{ fontSize:11, color:'var(--accent-blue)', marginTop:4, fontWeight:600 }}>{user?.role}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
    <label className="form-label">PROFILE PHOTO</label>
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
          Choose Photo
        </label>
        {photoFile && (
          <p style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
            ✓ {photoFile.name}
          </p>
        )}
      </div>
    </div>
  </div>



          <div className="form-group">
            <label className="form-label">DISPLAY NAME</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <p style={{ fontSize:13, fontWeight:700, margin:'20px 0 12px', color:'var(--text-secondary)' }}>Change Password</p>
          <div className="form-group">
            <label className="form-label">CURRENT PASSWORD</label>
            <input type="password" className="form-input" value={curPwd} onChange={e => setCurPwd(e.target.value)} placeholder="Leave blank to keep unchanged" />
          </div>
          <div className="form-group">
            <label className="form-label">NEW PASSWORD</label>
            <input type="password" className="form-input" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 6 characters" />
          </div>

          {msg && <p style={{ color:'var(--green)', fontSize:13, marginBottom:12 }}>{msg}</p>}
          {err && <p className="form-error">{err}</p>}

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop:8 }}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthProvider>
      <ProtectedLayout>
        <SettingsContent />
      </ProtectedLayout>
    </AuthProvider>
  );
}
