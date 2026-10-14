'use client';
// src/app/projects/edit/page.tsx — admin: edit an existing project.
//
// `?id=` rather than a path segment, for the same reason as the detail page:
// the production frontend is a static export and cannot pre-render a dynamic
// route for ids that do not exist at build time.
import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import ProjectForm from '@/components/projects/ProjectForm';
import { projectsAPI } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';

function EditProjectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { user } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setError('No project was specified.'); setLoading(false); return; }
    projectsAPI.getOne(id)
      .then((res) => setProject(res.data.project))
      .catch((err) => setError(err?.response?.data?.error || 'Could not load this project.'))
      .finally(() => setLoading(false));
  }, [id]);

  const blocked = user && user.role !== 'ADMIN';

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading project…</div></div>
      </ProtectedLayout>
    );
  }

  if (blocked || error || !project) {
    return (
      <ProtectedLayout>
        <div className="pj-page">
          <div className="pj-empty">
            {blocked ? 'Only an administrator can edit projects.' : (error || 'Project not found.')}
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
            <h1 className="pj-title">Edit project</h1>
            <div className="pj-sub">{project.title}</div>
          </div>
          <Link href={`/projects/detail?id=${project.id}`} className="pj-btn pj-btn-sm pj-btn-ghost">
            ← Back to project
          </Link>
        </div>

        <ProjectForm
          initial={project}
          onSaved={() => router.push(`/projects/detail?id=${project.id}`)}
        />
      </div>
    </ProtectedLayout>
  );
}

/**
 * `useSearchParams` suspends, and a page that reads it has to sit under a
 * boundary or the static export cannot prerender this route at all. Same
 * arrangement as community/deal-room/detail.
 */
export default function EditProjectPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading project…</div></div>
      </ProtectedLayout>
    }>
      <EditProjectInner />
    </Suspense>
  );
}
