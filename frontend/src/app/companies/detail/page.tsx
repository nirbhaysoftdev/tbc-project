'use client';
// src/app/companies/detail/page.tsx
//
// A company profile: logo, banner, the rich-text description, every structured
// field, the people attached to it, and the gallery, documents and video,
// organised into tabs.
//
// The id arrives as `?id=`, not as a path segment. The frontend is a static
// export in production, which cannot pre-render a dynamic route for ids that
// do not exist at build time — the same arrangement as the projects module and
// the deal room.
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ProtectedLayout from '@/components/layout/ProtectedLayout';
import CompanyMedia from '@/components/companies/CompanyMedia';
import EnquiryModal from '@/components/enquiry/EnquiryModal';
import { CompanyLogo, prettyCategory } from '@/components/companies/CompanyCard';
import { PersonAvatar, Person } from '@/components/projects/MemberSelect';
import { companiesAPI, mediaSrc, formatEur } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import '@/styles/projects.css';
import '@/styles/companies.css';
import { isAdminRole } from '@/lib/roles';

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'pj-badge-active',
  DRAFT: 'pj-badge-draft',
  INACTIVE: 'pj-badge-closed',
  ARCHIVED: 'pj-badge-cancelled',
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

/** Owners or team members. */
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

const TABS = ['Overview', 'Description', 'People', 'Media'] as const;
type Tab = typeof TABS[number];

function CompanyDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const { user } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('Overview');
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(() => {
    if (!id) { setLoading(false); setError('No company was specified.'); return; }
    setLoading(true);
    companiesAPI.getOne(id)
      .then((res) => { setCompany(res.data.company); setError(''); })
      .catch((err) => setError(err?.response?.status === 404
        ? 'This company profile does not exist, or is not published.'
        : (err?.response?.data?.error || 'Could not load this company.')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Create, edit and upload are all `requireAdmin` on the server (backend
  // routes/companies.js), so the manage controls are admin-only here. Showing
  // them to anyone else would offer them a 403.
  const canManage = isAdminRole(user?.role);


  if (loading) {
    return (
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading company…</div></div>
      </ProtectedLayout>
    );
  }

  if (error || !company) {
    return (
      <ProtectedLayout>
        <div className="pj-page">
          <div className="pj-empty">
            {error || 'Company not found.'}
            <div style={{ marginTop: 14 }}>
              <Link href="/companies" className="pj-btn pj-btn-sm">← Back to companies</Link>
            </div>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  const banner = company.bannerUrl ? mediaSrc(company.bannerUrl) : null;

  return (
    <ProtectedLayout>
      <div className="pj-page">
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/companies" className="pj-btn pj-btn-sm pj-btn-ghost">← All companies</Link>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="pj-btn pj-btn-sm pj-btn-gold"
              onClick={() => setConnecting(true)}>
              Connect Now
            </button>
            {canManage && (
              <Link href={`/companies/edit?id=${company.id}`} className="pj-btn pj-btn-sm pj-btn-primary">
                Edit company
              </Link>
            )}
          </div>
        </div>

        {/* ── Banner ── */}
        <div className="pj-detail-banner">
          {banner ? (
            <img src={banner} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} />
          ) : (
            <span className="pj-card-banner-empty">{prettyCategory(company.category)}</span>
          )}

          <div className="pj-detail-banner-overlay">
            <div className="cp-detail-identity">
              <CompanyLogo company={company} size="lg" />
              <div style={{ minWidth: 0 }}>
                <h1 className="pj-detail-name">{company.name}</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <span className={`pj-badge ${STATUS_CLASS[company.status] || 'pj-badge-draft'}`}>
                    {company.status}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'rgba(232,234,246,0.85)' }}>
                    {prettyCategory(company.category)}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'end' }}>
              <span className="pj-valuation-label">Valuation</span>
              <span className="pj-valuation" style={{ fontSize: 22 }}>
                {company.valuation === null || company.valuation === undefined
                  ? '—' : formatEur(company.valuation)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="pj-detail-layout">
          <div>
            <div className="pj-tabs" role="tablist">
              {TABS.map((name) => (
                <button key={name} type="button" role="tab" aria-selected={tab === name}
                  className={`pj-tab${tab === name ? ' active' : ''}`}
                  onClick={() => setTab(name)}>
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
                      {company.valuation === null || company.valuation === undefined
                        ? null : formatEur(company.valuation)}
                    </Fact>
                    <Fact label="Category">{prettyCategory(company.category)}</Fact>
                    <Fact label="Established">
                      {company.establishedAt ? asDate(company.establishedAt) : null}
                    </Fact>
                    <Fact label="Status">{company.status}</Fact>
                    <Fact label="Owners">
                      {company.owners?.length
                        ? company.owners.map((o: Person) => o.name).join(', ')
                        : null}
                    </Fact>
                    <Fact label="Last modified">{asDateTime(company.updatedAt)}</Fact>
                  </div>
                </div>

                <div className="pj-panel">
                  <div className="pj-panel-title">Locations</div>
                  {company.locations?.length ? (
                    <div className="cp-locations">
                      {company.locations.map((loc: string) => (
                        <span className="cp-location" key={loc}>{loc}</span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No locations recorded.</div>
                  )}
                </div>

                {company.description && (
                  <div className="pj-panel">
                    <div className="pj-panel-title">Summary</div>
                    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {company.description}
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'Description' && (
              <div className="pj-panel">
                <div className="pj-panel-title">Company description</div>
                {company.detailsHtml ? (
                  // Sanitised server-side on every write, against an allowlist
                  // of the editor's own output (backend services/richText.js).
                  // `.pj-rich` scopes the styling so authored markup cannot
                  // restyle the page around it.
                  <div className="pj-rich" dangerouslySetInnerHTML={{ __html: company.detailsHtml }} />
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    No description has been written for this company yet.
                  </div>
                )}
              </div>
            )}

            {tab === 'People' && (
              <>
                <div className="pj-panel">
                  <div className="pj-panel-title">Owners</div>
                  <PeopleList people={company.owners} />
                </div>
                <div className="pj-panel">
                  <div className="pj-panel-title">Team members</div>
                  <PeopleList people={company.teamMembers} />
                </div>
              </>
            )}

            {tab === 'Media' && (
              <CompanyMedia
                companyId={company.id}
                canManage={canManage}
                logoDocId={company.logoDocId}
                bannerDocId={company.bannerDocId}
                videoLinks={company.videoLinks}
                onChanged={load}
              />
            )}
          </div>

          {/* ── Sidebar: the facts worth having on every tab ── */}
          <aside>
            <div className="pj-panel">
              <div className="pj-panel-title">Company information</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Fact label="Established">
                  {company.establishedAt ? asDate(company.establishedAt) : null}
                </Fact>
                <Fact label="Locations">
                  {company.locations?.length ? company.locations.join(' · ') : null}
                </Fact>
                <Fact label="Website">
                  {company.websiteUrl ? (
                    <a href={company.websiteUrl} target="_blank" rel="noopener noreferrer nofollow">
                      {company.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  ) : null}
                </Fact>
                <Fact label="Contact person">{company.contactPerson}</Fact>
                <Fact label="Last modified">{asDateTime(company.updatedAt)}</Fact>
                <Fact label="Added">{asDate(company.createdAt)}</Fact>
              </div>
            </div>

            <div className="pj-panel">
              <div className="pj-panel-title">Get in touch</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
                Contact details are not published. Send a message and the company’s team
                will reply to you directly.
              </p>
              <button type="button" className="pj-btn pj-btn-gold" style={{ width: '100%' }}
                onClick={() => setConnecting(true)}>
                Connect Now
              </button>
            </div>
          </aside>
        </div>

        {connecting && (
          <EnquiryModal
            target={{ kind: 'company', id: company.id }}
            subjectName={company.name}
            onClose={() => setConnecting(false)}
          />
        )}
      </div>
    </ProtectedLayout>
  );
}

/**
 * `useSearchParams` suspends, and a page that reads it has to sit under a
 * boundary or the static export cannot prerender this route at all.
 */
export default function CompanyDetailPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="pj-page"><div className="pj-empty">Loading company…</div></div>
      </ProtectedLayout>
    }>
      <CompanyDetailInner />
    </Suspense>
  );
}
