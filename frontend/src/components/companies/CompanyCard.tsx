'use client';
// src/components/companies/CompanyCard.tsx
//
// One company in the listing, in grid or list view. Built on the project
// module's `.pj-card` so the two listings are the same card with a logo added,
// rather than two cards that have to be kept looking alike.
import Link from 'next/link';
import React from 'react';
import { formatEur, mediaSrc } from '@/lib/api';

export interface CompanySummary {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  status?: string | null;
  valuation?: number | null;
  locations?: string[] | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  establishedAt?: string | null;
  updatedAt?: string | null;
  owners?: { id?: string | null; name: string }[] | null;
  createdBy?: { id: string; name: string } | null;
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'pj-badge-active',
  DRAFT: 'pj-badge-draft',
  INACTIVE: 'pj-badge-closed',
  ARCHIVED: 'pj-badge-cancelled',
};

/** Stored categories are identifiers (REAL_ESTATE); cards show them as words. */
export const prettyCategory = (value?: string | null) => {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

/**
 * The logo plate.
 *
 * Exported because the detail page and the form's preview need exactly the
 * same thing, and a logo that renders differently in three places is the kind
 * of drift this module is trying to avoid.
 */
export function CompanyLogo({
  company, size = 'md', className = '',
}: {
  company: Pick<CompanySummary, 'name' | 'logoUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass = size === 'sm' ? ' cp-logo-sm' : size === 'lg' ? ' cp-logo-lg' : '';
  return (
    <span className={`cp-logo${sizeClass} ${className}`.trim()}>
      {company.logoUrl
        ? <img src={mediaSrc(company.logoUrl)} alt="" draggable={false}
            onContextMenu={(e) => e.preventDefault()} />
        : <span className="cp-logo-fallback">{initials(company.name || '?')}</span>}
    </span>
  );
}

/** "Milan · Dubai · +2" — the first few locations, then a count. */
function Locations({ locations }: { locations?: string[] | null }) {
  if (!locations || locations.length === 0) return null;
  const shown = locations.slice(0, 2);
  const rest = locations.length - shown.length;
  return (
    <>
      {shown.map((loc) => <span key={loc}>{loc}</span>)}
      {rest > 0 && <span>+{rest}</span>}
    </>
  );
}

/** "Acme Holding and 2 others" — owners are a list, so the card summarises. */
const ownersLabel = (company: CompanySummary) => {
  const owners = (company.owners || []).filter((o) => o?.name);
  if (owners.length === 0) return company.createdBy?.name || null;
  if (owners.length === 1) return owners[0].name;
  return `${owners[0].name} +${owners.length - 1}`;
};

export default function CompanyCard({
  company, view = 'grid',
}: {
  company: CompanySummary;
  view?: 'grid' | 'list';
}) {
  const banner = company.bannerUrl ? mediaSrc(company.bannerUrl) : null;
  const owners = ownersLabel(company);

  return (
    // Query-string detail route, not /companies/<id>: the frontend is a static
    // export, which cannot pre-render a dynamic segment it has never seen.
    <Link href={`/companies/detail?id=${company.id}`} className={`pj-card ${view}`}>
      <div className="pj-card-banner">
        {banner ? (
          <img src={banner} alt="" loading="lazy" draggable={false}
            onContextMenu={(e) => e.preventDefault()} />
        ) : (
          <span className="pj-card-banner-empty">{prettyCategory(company.category)}</span>
        )}
        <CompanyLogo company={company} className="cp-card-logo" />
      </div>

      <div className="pj-card-body cp-card-body-offset">
        <div className="pj-card-top">
          <div style={{ minWidth: 0 }}>
            <div className="pj-card-name">{company.name}</div>
            <div className="pj-card-meta">
              <span>{prettyCategory(company.category)}</span>
              {company.locations && company.locations.length > 0 && (
                <>
                  <span className="pj-dot">·</span>
                  <Locations locations={company.locations} />
                </>
              )}
            </div>
          </div>
          {company.status && (
            <span className={`pj-badge ${STATUS_CLASS[company.status] || 'pj-badge-draft'}`}>
              {company.status}
            </span>
          )}
        </div>

        {company.description && <p className="pj-card-desc">{company.description}</p>}

        <div className="pj-card-foot">
          <div>
            <span className="pj-valuation-label">Valuation</span>
            <span className="pj-valuation">
              {company.valuation === null || company.valuation === undefined
                ? '—'
                : formatEur(company.valuation)}
            </span>
          </div>

          {owners && (
            <div className="pj-owner">
              <span className="pj-avatar" aria-hidden="true">{initials(owners)}</span>
              <span className="pj-owner-name">{owners}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
