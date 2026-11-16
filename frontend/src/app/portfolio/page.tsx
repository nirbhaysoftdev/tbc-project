'use client';
// src/app/portfolio/page.tsx
//
// The portfolio was merged into the dashboard (balance, returns, the capital
// donut and the monthly profit chart now live there). This stays only so an old
// bookmark or link lands somewhere useful instead of a 404.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PortfolioRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/dashboard'); }, [router]);
  return <div style={{ margin: 60, textAlign: 'center' }}><div className="spinner" /></div>;
}
