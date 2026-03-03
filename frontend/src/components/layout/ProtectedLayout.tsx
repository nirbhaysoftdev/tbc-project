'use client';
// src/components/layout/ProtectedLayout.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Sidebar   from './Sidebar';
import Topbar    from './Topbar';
import DevNotice from './DevNotice';

interface Props {
  children:      React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedLayout({ children, requireAdmin = false }: Props) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user)                                 { router.replace('/login');     return; }
      if (requireAdmin && user.role !== 'ADMIN') { router.replace('/dashboard'); }
    }
  }, [user, loading, requireAdmin, router]);

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div className="spinner" />
      </div>
    );
  }
  if (!user) return null;
  if (requireAdmin && user.role !== 'ADMIN') return null;

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-area">
        {/* Dev notice TOP — text fetched from DB, not hardcoded */}
        <DevNotice position="top" />

        <Topbar />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="content-wrap" style={{ flex: 1 }}>
            {children}
          </div>

          {/* Dev notice BOTTOM — same DB source */}
          <DevNotice position="bottom" />
        </div>
      </div>
    </div>
  );
}
