'use client';
// src/app/projects/new/page.tsx — admin: create a project.
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import ProjectForm from '@/components/projects/ProjectForm';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';

export default function NewProjectPage() {
  const router = useRouter();
  const { user } = useAuth();

  // The create and update endpoints are admin-only on the server, so this is
  // about not showing a form that cannot save rather than about access
  // control.
  if (user && user.role !== 'ADMIN') {
    return (
      <ProtectedLayout>
        <div className="pj-page">
          <div className="pj-empty">
            Only an administrator can create projects.
            <div style={{ marginTop: 14 }}>
              <Link href="/projects" className="pj-btn pj-btn-sm">← Back to projects</Link>
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
            <h1 className="pj-title">New project</h1>
            <div className="pj-sub">Add a project to the TBC portfolio.</div>
          </div>
          <Link href="/projects" className="pj-btn pj-btn-sm pj-btn-ghost">← All projects</Link>
        </div>

        <ProjectForm onSaved={(project) => router.push(`/projects/detail?id=${project.id}`)} />
      </div>
    </ProtectedLayout>
  );
}
