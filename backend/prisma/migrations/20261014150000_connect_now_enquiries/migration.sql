-- Connect Now / Enquire Now.
--
-- Members no longer see a company's email address or phone number. They send an
-- enquiry instead, which is recorded here and delivered to the recipient
-- configured for that project or company.
--
-- Guarded and idempotent, like the rest of this directory.

-- ── Status enum ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EnquiryStatus') THEN
    CREATE TYPE "EnquiryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
  END IF;
END $$;

-- ── Per-target recipient configuration ────────────────────────────────────────
-- Nullable: unset means "use DEFAULT_ENQUIRY_EMAIL". These columns are never
-- serialised to a member — they are internal routing addresses, not public
-- contact details.
ALTER TABLE "projects"  ADD COLUMN IF NOT EXISTS "enquiryEmail" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "enquiryEmail" TEXT;

-- ── enquiries ─────────────────────────────────────────────────────────────────
-- The row is written before the email is attempted and updated with the
-- outcome, so a failed delivery leaves a record that can be retried or chased
-- rather than disappearing into a log.
CREATE TABLE IF NOT EXISTS "enquiries" (
  "id"             TEXT NOT NULL,
  "memberId"       TEXT NOT NULL,
  "projectId"      TEXT,
  "companyId"      TEXT,
  -- Snapshot of the name at send time, so the record still reads correctly
  -- after the project or company is renamed or deleted.
  "subjectName"    TEXT NOT NULL,
  "message"        TEXT NOT NULL,
  -- Where it actually went, resolved at send time. The configured recipient
  -- can change later; this is the audit trail.
  "recipientEmail" TEXT NOT NULL,
  "status"         "EnquiryStatus" NOT NULL DEFAULT 'PENDING',
  "error"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"         TIMESTAMP(3),

  CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- (memberId, createdAt) is the one the duplicate/throttle check reads.
CREATE INDEX IF NOT EXISTS "enquiries_memberId_createdAt_idx" ON "enquiries"("memberId", "createdAt");
CREATE INDEX IF NOT EXISTS "enquiries_projectId_idx"          ON "enquiries"("projectId");
CREATE INDEX IF NOT EXISTS "enquiries_companyId_idx"          ON "enquiries"("companyId");
CREATE INDEX IF NOT EXISTS "enquiries_status_idx"             ON "enquiries"("status");

-- ── Foreign keys ──────────────────────────────────────────────────────────────
-- The member cascades: deleting an account removes their enquiries. The target
-- is SET NULL, because the record of the enquiry (and its `subjectName`
-- snapshot) should outlive the project or company it was about.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_memberId_fkey') THEN
    ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_projectId_fkey') THEN
    ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_companyId_fkey') THEN
    ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- An enquiry is about exactly one thing. Enforced here rather than trusted
  -- to every future caller of this table.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enquiries_one_target') THEN
    ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_one_target"
      CHECK (("projectId" IS NOT NULL)::int + ("companyId" IS NOT NULL)::int = 1);
  END IF;
END $$;
