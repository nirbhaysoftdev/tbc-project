'use client';
// src/app/companies/new/page.tsx — admin: create a company profile.
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import CompanyForm from '@/components/companies/CompanyForm';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';
import '@/styles/companies.css';
import { isAdminRole } from '@/lib/roles';

export default function NewCompanyPage() {
  const router = useRouter();
  const { user } = useAuth();

  // The create and update endpoints are admin-only on the server, so this is
  // about not showing a form that cannot save rather than about access
  // control.
  if (user && !isAdminRole(user.role)) {
    return (
      <ProtectedLayout>
        <div className="pj-page">
          <div className="pj-empty">
            Only an administrator can create company profiles.
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
            <h1 className="pj-title">New company</h1>
            <div className="pj-sub">Add a company profile to the TBC directory.</div>
          </div>
          <Link href="/companies" className="pj-btn pj-btn-sm pj-btn-ghost">← All companies</Link>
        </div>

        <CompanyForm onSaved={(company) => router.push(`/companies/detail?id=${company.id}`)} />
      </div>
    </ProtectedLayout>
  );
}
