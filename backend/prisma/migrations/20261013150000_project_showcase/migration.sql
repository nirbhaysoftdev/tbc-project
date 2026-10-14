-- Project showcase module: the structured fields, rich-text body and banner
-- choice behind the project listing and detail pages.
--
-- Two things are happening in this file, deliberately together.
--
-- 1. The genuinely new columns: valuation, detailsHtml, establishedAt,
--    bannerDocId.
--
-- 2. Eight columns that were added to schema.prisma with `prisma db push`
--    and therefore never reached a migration: primaryObjective, managerId,
--    teamMembers, investors, partners, clients, url, contact. They exist on
--    the development database and on NO other, exactly the drift that broke
--    production once already (see 20261011140000_repair_schema_drift). They
--    are adopted here so `migrate deploy` installs them.
--
-- Every statement is IF NOT EXISTS / idempotent, so this reaches the same end
-- state from a drifted development database or a clean production one.

-- ── Adopted from db push ──────────────────────────────────────────────────────
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "primaryObjective" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "managerId"        TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "teamMembers"      JSONB;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "investors"        JSONB;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "partners"         JSONB;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "clients"          JSONB;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "url"              TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "contact"          TEXT;

-- ── New in this module ────────────────────────────────────────────────────────
-- valuation is euros, always. See the comment on the model.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "valuation"     DOUBLE PRECISION;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "detailsHtml"   TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "establishedAt" TIMESTAMP(3);
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "bannerDocId"   TEXT;

-- Existing projects get their funding ask as an opening valuation so the
-- listing has a figure to show. Only rows with no valuation are touched.
UPDATE "projects" SET "valuation" = "targetAmount" WHERE "valuation" IS NULL;

-- Back-fill the rich-text body from the plain description, so a project that
-- predates the editor opens with its text already in place rather than empty.
-- Escaped, then wrapped in a paragraph: the description is plain text and must
-- not become live markup the first time it is rendered.
UPDATE "projects"
   SET "detailsHtml" = '<p>' || replace(replace(replace(
         "description", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
 WHERE "detailsHtml" IS NULL AND "description" IS NOT NULL AND "description" <> '';

-- ── manager relation ──────────────────────────────────────────────────────────
-- Added as a real foreign key now that the column is migrated. ON DELETE SET
-- NULL: deleting a member must not delete their projects, it only unassigns
-- them. Any manager id that no longer resolves to a user is cleared first,
-- otherwise the constraint cannot be created on a drifted database.
UPDATE "projects" SET "managerId" = NULL
 WHERE "managerId" IS NOT NULL
   AND "managerId" NOT IN (SELECT "id" FROM "users");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_managerId_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Indexes for the listing's filters and sorts ───────────────────────────────
CREATE INDEX IF NOT EXISTS "projects_ownerId_idx"   ON "projects"("ownerId");
CREATE INDEX IF NOT EXISTS "projects_managerId_idx" ON "projects"("managerId");
CREATE INDEX IF NOT EXISTS "projects_category_idx"  ON "projects"("category");
CREATE INDEX IF NOT EXISTS "projects_status_idx"    ON "projects"("status");
