-- Company profile management: the company directory, its profiles and media.
--
-- Written by hand and guarded, like the rest of this directory, so it reaches
-- the same end state on a development database that has drifted and on a clean
-- production one. Nothing here alters an existing table except `users`, which
-- gains no column - only the new tables reference it.

-- ── Status enum ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyStatus') THEN
    CREATE TYPE "CompanyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
  END IF;
END $$;

-- ── companies ─────────────────────────────────────────────────────────────────
-- `ownerIds` and `locations` are scalar text arrays rather than JSON: the
-- listing filters on them with `has`, which Postgres can satisfy from an index,
-- and matching an element inside a JSON array of objects cannot be done
-- reliably. The display copies live in `owners` / `teamMembers` as JSON.
CREATE TABLE IF NOT EXISTS "companies" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "status"        "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  "description"   TEXT,
  "detailsHtml"   TEXT,
  "valuation"     DOUBLE PRECISION,
  "establishedAt" TIMESTAMP(3),
  "logoDocId"     TEXT,
  "bannerDocId"   TEXT,
  "owners"        JSONB,
  "ownerIds"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "locations"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "teamMembers"   JSONB,
  "websiteUrl"    TEXT,
  "contactPerson" TEXT,
  "contactEmail"  TEXT,
  "contactPhone"  TEXT,
  "videoLinks"    JSONB,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- ── company_documents ─────────────────────────────────────────────────────────
-- `kind` picks the viewer (IMAGE | PDF | DOC | VIDEO); `purpose` says what the
-- file is for (LOGO | BANNER | GALLERY | DOCUMENT | VIDEO | OTHER). Both are
-- needed: a logo and a gallery photo are both images.
--
-- ON DELETE CASCADE from the company, matching project_documents. The files
-- themselves are removed by the controller, which collects the paths before
-- the rows disappear.
CREATE TABLE IF NOT EXISTS "company_documents" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "fileUrl"    TEXT NOT NULL,
  "kind"       TEXT NOT NULL DEFAULT 'PDF',
  "purpose"    TEXT NOT NULL DEFAULT 'DOCUMENT',
  "mimeType"   TEXT,
  "sizeBytes"  INTEGER,
  "uploadedBy" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "companies_category_idx"    ON "companies"("category");
CREATE INDEX IF NOT EXISTS "companies_status_idx"      ON "companies"("status");
CREATE INDEX IF NOT EXISTS "companies_createdById_idx" ON "companies"("createdById");

-- GIN indexes are what make `ownerIds has x` and `locations has x` index scans
-- rather than sequential ones.
CREATE INDEX IF NOT EXISTS "companies_ownerIds_idx"  ON "companies" USING GIN ("ownerIds");
CREATE INDEX IF NOT EXISTS "companies_locations_idx" ON "companies" USING GIN ("locations");

CREATE INDEX IF NOT EXISTS "company_documents_companyId_idx"
  ON "company_documents"("companyId");
CREATE INDEX IF NOT EXISTS "company_documents_companyId_purpose_idx"
  ON "company_documents"("companyId", "purpose");

-- ── Foreign keys ──────────────────────────────────────────────────────────────
-- The creator is SET NULL: deleting a member must not delete the company
-- profiles they entered.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_createdById_fkey') THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_documents_companyId_fkey') THEN
    ALTER TABLE "company_documents"
      ADD CONSTRAINT "company_documents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
