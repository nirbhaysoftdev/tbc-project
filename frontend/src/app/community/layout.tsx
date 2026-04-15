'use client';
// src/app/community/layout.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import CommunityNav from '@/components/community/CommunityNav';
import { AuthProvider } from '@/lib/auth';

function CommunityLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="comm-layout">
      <CommunityNav />
      {children}
    </div>
  );
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CommunityLayoutInner>{children}</CommunityLayoutInner>
    </AuthProvider>
  );
}
