'use client';
// src/app/projects/detail/page.tsx
//
// The project detail page: banner, gallery, the rich-text body, every
// structured field, and the people attached to the project, organised into
// tabs.
//
// The project id arrives as `?id=`, not as a path segment. The frontend is a
// static export (next.config.js sets `output: 'export'` in production), which
// cannot pre-render `/projects/[id]` for ids that do not exist at build time.
// The deal room's own detail page works the same way.
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import ProjectDocuments from '@/components/projects/ProjectDocuments';
import EnquiryModal from '@/components/enquiry/EnquiryModal';
import { PersonAvatar, Person } from '@/components/projects/MemberSelect';
import { prettyCategory } from '@/components/projects/ProjectCard';
import { projectsAPI, mediaSrc, formatEur } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'pj-badge-active',
  DRAFT: 'pj-badge-draft',
  FUNDED: 'pj-badge-funded',
  CLOSED: 'pj-badge-closed',
  CANCELLED: 'pj-badge-cancelled',
};

const asDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const asDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** A labelled fact, rendered only when there is something to say. */
function Fact({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="pj-fact">
      <div className="pj-fact-label">{label}</div>
      <div className="pj-fact-value">{children || '—'}</div>
    </div>
  );
}

/** One of the people lists: team, investors, partners, clients. */
function PeopleList({ people }: { people?: Person[] | null }) {
  if (!people || people.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>None recorded.</div>;
  }
  return (
    <div className="pj-people">
      {people.map((person, i) => (
        <div className="pj-person" key={person.id || `${person.name}-${i}`}>
          <PersonAvatar person={person} />
          <div style={{ minWidth: 0 }}>
            <div className="pj-person-name">{person.name}</div>
            {person.role && <div className="pj-person-role">{person.role}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const TABS = ['Overview', 'Details', 'People', 'Documents'] as const;
type Tab = typeof TABS[number];

function ProjectDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { user } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('Overview');
  const [enquiring, setEnquiring] = useState(false);

  const load = useCallback(() => {
    if (!id) { setLoading(false); setError('No project was specified.'); return; }
    setLoading(true);
    projectsAPI.getOne(id)
      .then((res) => { setProject(res.data.project); setError(''); })
      .catch((err) => setError(err?.response?.status === 404
        ? 'This project does not exist, or is not published.'
        : (err?.response?.data?.error || 'Could not load this project.')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Admin only, deliberately: creating, editing and uploading are all
  // `requireAdmin` on the server (backend routes/projects.js), so showing
  // these controls to a project's non-admin owner would offer them a 403.
  // `project.canManage` from the API is about seeing an unpublished project,
  // which is a different question.
  const canManage = user?.role === 'ADMIN';


  const setBanner = async (docId: string) => {
    try {
      await projectsAPI.update(id, { bannerDocId: docId });
      load();
    } catch { /* the gallery stays as it was; nothing is lost */ }
  };

  if (loading) {
    return (
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading project…</div></div>
      </ProtectedLayout>
    );
  }

  if (error || !project) {
    return (
      <ProtectedLayout>
        <div className="pj-page">
          <div className="pj-empty">
            {error || 'Project not found.'}
            <div style={{ marginTop: 14 }}>
              <Link href="/projects" className="pj-btn pj-btn-sm">← Back to projects</Link>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  const banner = project.bannerUrl ? mediaSrc(project.bannerUrl) : (project.imageUrl || null);

  return (
    <ProtectedLayout>
      <div className="pj-page">
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/projects" className="pj-btn pj-btn-sm pj-btn-ghost">← All projects</Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="pj-btn pj-btn-sm pj-btn-gold"
              onClick={() => setEnquiring(true)}>
              Enquire Now
            </button>
            {canManage && (
              <Link href={`/projects/edit?id=${project.id}`} className="pj-btn pj-btn-sm pj-btn-primary">
                Edit project
              </Link>
            )}
          </div>
        </div>

        {/* ── Banner ── */}
        <div className="pj-detail-banner">
          {banner ? (
            <img
              src={banner}
              alt=""
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : (
            <span className="pj-card-banner-empty">{prettyCategory(project.category)}</span>
          )}

          <div className="pj-detail-banner-overlay">
            <div style={{ minWidth: 0 }}>
              <h1 className="pj-detail-name">{project.title}</h1>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <span className={`pj-badge ${STATUS_CLASS[project.status] || 'pj-badge-draft'}`}>
                  {project.status}
                </span>
                <span style={{ fontSize: 12.5, color: 'rgba(232,234,246,0.85)' }}>
                  {prettyCategory(project.category)}
                  {project.location ? ` · ${project.location}` : ''}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'end' }}>
              <span className="pj-valuation-label">Valuation</span>
              <span className="pj-valuation" style={{ fontSize: 22 }}>
                {formatEur(project.valuationEur ?? project.valuation ?? project.targetAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="pj-detail-layout">
          <div>
            <div className="pj-tabs" role="tablist">
              {TABS.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  className={`pj-tab${tab === name ? ' active' : ''}`}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </div>

            {tab === 'Overview' && (
              <>
                <div className="pj-panel">
                  <div className="pj-panel-title">At a glance</div>
                  <div className="pj-facts">
                    <Fact label="Valuation">
                      {formatEur(project.valuationEur ?? project.valuation ?? project.targetAmount)}
                    </Fact>
                    <Fact label="Category">{prettyCategory(project.category)}</Fact>
                    <Fact label="Location">{project.location}</Fact>
                    <Fact label="Established">{project.establishedAt ? asDate(project.establishedAt) : null}</Fact>
                    <Fact label="Project owner">{project.owner?.name}</Fact>
                    <Fact label="Project manager">{project.manager?.name}</Fact>
                    <Fact label="Status">{project.status}</Fact>
                    <Fact label="Last modified">{asDateTime(project.updatedAt)}</Fact>
                  </div>
                </div>

                {project.primaryObjective && (
                  <div className="pj-panel">
                    <div className="pj-panel-title">Primary objective</div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {project.primaryObjective}
                    </div>
                  </div>
                )}

                {project.description && (
                  <div className="pj-panel">
                    <div className="pj-panel-title">Summary</div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {project.description}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'Details' && (
              <div className="pj-panel">
                <div className="pj-panel-title">Project details</div>
                {project.detailsHtml ? (
                  // Sanitised server-side on every write, against an allowlist
                  // of the editor's own output (backend services/richText.js).
                  // `.pj-rich` scopes the styling so authored markup cannot
                  // restyle the page around it.
                  <div className="pj-rich" dangerouslySetInnerHTML={{ __html: project.detailsHtml }} />
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    No detailed description has been written for this project yet.
                  </div>
                )}
              </div>
            )}

            {tab === 'People' && (
              <>
                <div className="pj-panel">
                  <div className="pj-panel-title">Ownership &amp; management</div>
                  <div className="pj-facts">
                    <Fact label="Project owner">
                      {project.owner ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar person={project.owner} />
                          {project.owner.name}
                        </span>
                      ) : null}
                    </Fact>
                    <Fact label="Project manager">
                      {project.manager ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <PersonAvatar person={project.manager} />
                          {project.manager.name}
                        </span>
                      ) : null}
                    </Fact>
                  </div>
                </div>

                <div className="pj-panel">
                  <div className="pj-panel-title">Team members</div>
                  <PeopleList people={project.teamMembers} />
                </div>

                <div className="pj-panel">
                  <div className="pj-panel-title">Investors</div>
                  <PeopleList people={project.investors} />
                </div>

                <div className="pj-panel">
                  <div className="pj-panel-title">Partners</div>
                  <PeopleList people={project.partners} />
                </div>

                <div className="pj-panel">
                  <div className="pj-panel-title">Clients</div>
                  <PeopleList people={project.clients} />
                </div>
              </>
            )}

            {tab === 'Documents' && (
              <ProjectDocuments
                projectId={project.id}
                canManage={canManage}
                bannerDocId={project.bannerDocId}
                onSetBanner={canManage ? setBanner : undefined}
                onChanged={load}
              />
            )}
          </div>

          {/* ── Sidebar: the facts worth having on every tab ── */}
          <aside>
            <div className="pj-panel">
              <div className="pj-panel-title">Project information</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Fact label="Established">{project.establishedAt ? asDate(project.establishedAt) : null}</Fact>
                <Fact label="Primary objective">{project.primaryObjective}</Fact>
                <Fact label="Website">
                  {project.url ? (
                    <a href={project.url} target="_blank" rel="noopener noreferrer nofollow">
                      {project.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : null}
                </Fact>
                <Fact label="Last modified">{asDateTime(project.updatedAt)}</Fact>
                <Fact label="Added">{asDate(project.createdAt)}</Fact>
              </div>
            </div>

            <div className="pj-panel">
              <div className="pj-panel-title">Interested?</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
                Contact details are not published. Send a message and the project team
                will reply to you directly.
              </p>
              <button type="button" className="pj-btn pj-btn-gold" style={{ width: '100%' }}
                onClick={() => setEnquiring(true)}>
                Enquire Now
              </button>
            </div>

            {project.milestones?.length > 0 && (
              <div className="pj-panel">
                <div className="pj-panel-title">Milestones</div>
                <div className="pj-people">
                  {project.milestones.map((m: any) => (
                    <div className="pj-person" key={m.id} style={{ alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="pj-person-name">{m.title}</div>
                        <div className="pj-person-role">
                          {asDate(m.targetDate)}{m.amount ? ` · ${formatEur(m.amount)}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {enquiring && (
          <EnquiryModal
            target={{ kind: 'project', id: project.id }}
            subjectName={project.title}
            onClose={() => setEnquiring(false)}
          />
        )}
      </div>
    </ProtectedLayout>
  );
}

/**
 * `useSearchParams` suspends, and a page that reads it has to sit under a
 * boundary or the static export cannot prerender this route at all. Same
 * arrangement as community/deal-room/detail.
 */
export default function ProjectDetailPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading project…</div></div>
      </ProtectedLayout>
    }>
      <ProjectDetailInner />
    </Suspense>
  );
}
