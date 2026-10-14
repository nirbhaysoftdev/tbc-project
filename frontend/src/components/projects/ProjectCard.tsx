'use client';
// src/components/projects/ProjectCard.tsx
//
// One project in the listing, in either grid or list view. The same component
// serves both: `view` only changes the layout class, so the two views cannot
// drift apart in what they show.
import Link from 'next/link';
import React from 'react';
import { formatEur, mediaSrc } from '@/lib/api';

export interface ProjectSummary {
  id: string;
  title: string;
  category: string;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  valuationEur?: number | null;
  valuation?: number | null;
  targetAmount?: number | null;
  bannerUrl?: string | null;
  imageUrl?: string | null;
  establishedAt?: string | null;
  updatedAt?: string | null;
  mediaCount?: number;
  owner?: { id: string; name: string; profilePhoto?: string | null } | null;
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'pj-badge-active',
  DRAFT: 'pj-badge-draft',
  FUNDED: 'pj-badge-funded',
  CLOSED: 'pj-badge-closed',
  CANCELLED: 'pj-badge-cancelled',
};

// Stored categories are identifiers (REAL_ESTATE); the listing shows them as
// words. Anything not in this map is title-cased rather than hidden, so a
// category added later still reads properly without a code change.
export const prettyCategory = (value?: string | null) => {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

// The banner comes back as a ticketed stream path; `imageUrl` is the older
// plain-URL column, kept working for projects that predate project media.
const bannerSrc = (project: ProjectSummary) =>
  project.bannerUrl ? mediaSrc(project.bannerUrl) : (project.imageUrl || null);

export default function ProjectCard({
  project, view = 'grid',
}: {
  project: ProjectSummary;
  view?: 'grid' | 'list';
}) {
  const banner = bannerSrc(project);
  const valuation = project.valuationEur ?? project.valuation ?? project.targetAmount ?? 0;

  return (
    // Query-string detail route, not /projects/<id>: the frontend is a static
    // export, which cannot pre-render a dynamic segment it has never seen.
    // Same pattern as the deal room's own detail page.
    <Link href={`/projects/detail?id=${project.id}`} className={`pj-card ${view}`}>
      <div className="pj-card-banner">
        {banner ? (
          <img
            src={banner}
            alt=""
            loading="lazy"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <span className="pj-card-banner-empty">{prettyCategory(project.category)}</span>
        )}
      </div>

      <div className="pj-card-body">
        <div className="pj-card-top">
          <div style={{ minWidth: 0 }}>
            <div className="pj-card-name">{project.title}</div>
            <div className="pj-card-meta">
              <span>{prettyCategory(project.category)}</span>
              {project.location && <><span className="pj-dot">·</span><span>{project.location}</span></>}
            </div>
          </div>
          {project.status && (
            <span className={`pj-badge ${STATUS_CLASS[project.status] || 'pj-badge-draft'}`}>
              {project.status}
            </span>
          )}
        </div>

        {project.description && <p className="pj-card-desc">{project.description}</p>}

        <div className="pj-card-foot">
          <div>
            <span className="pj-valuation-label">Valuation</span>
            <span className="pj-valuation">{formatEur(valuation)}</span>
          </div>

          {project.owner && (
            <div className="pj-owner">
              <span className="pj-avatar" aria-hidden="true">
                {project.owner.profilePhoto
                  ? <img src={project.owner.profilePhoto} alt="" />
                  : initials(project.owner.name)}
              </span>
              <span className="pj-owner-name">{project.owner.name}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
