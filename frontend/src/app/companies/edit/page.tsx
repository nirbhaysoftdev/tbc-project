'use client';
// src/app/companies/edit/page.tsx — admin: edit a company profile.
//
// `?id=` rather than a path segment, for the same reason as the detail page:
// the production frontend is a static export and cannot pre-render a dynamic
// route for ids that do not exist at build time.
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import CompanyForm from '@/components/companies/CompanyForm';
import { companiesAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';
import '@/styles/companies.css';

function EditCompanyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { user } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setError('No company was specified.'); setLoading(false); return; }
    companiesAPI.getOne(id)
      .then((res) => setCompany(res.data.company))
      .catch((err) => setError(err?.response?.data?.error || 'Could not load this company.'))
      .finally(() => setLoading(false));
  }, [id]);

  const blocked = user && user.role !== 'ADMIN';

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading company…</div></div>
      </ProtectedLayout>
    );
  }

  if (blocked || error || !company) {
    return (
      <ProtectedLayout>
        <div className="pj-page">
          <div className="pj-empty">
            {blocked ? 'Only an administrator can edit company profiles.' : (error || 'Company not found.')}
            <div style={{ marginTop: 14 }}>
              <Link href="/companies" className="pj-btn pj-btn-sm">← Back to companies</Link>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <div className="pj-page">
        <div className="pj-head">
          <div>
            <h1 className="pj-title">Edit company</h1>
            <div className="pj-sub">{company.name}</div>
          </div>
          <Link href={`/companies/detail?id=${company.id}`} className="pj-btn pj-btn-sm pj-btn-ghost">
            ← Back to profile
          </Link>
        </div>

        <CompanyForm
          initial={company}
          onSaved={() => router.push(`/companies/detail?id=${company.id}`)}
        />
      </div>
    </ProtectedLayout>
  );
}

/**
 * `useSearchParams` suspends, so this page has to sit under a boundary or the
 * static export cannot prerender the route.
 */
export default function EditCompanyPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading company…</div></div>
      </ProtectedLayout>
    }>
      <EditCompanyInner />
    </Suspense>
  );
}
