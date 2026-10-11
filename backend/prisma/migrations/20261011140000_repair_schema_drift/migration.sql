-- Repair schema drift.
--
-- The MMS slice (KYC documents, KPI tables, walletEnabled, the REJECTED user
-- status and the extra profile fields) was applied to dev with `prisma db
-- push`, so no migration ever captured it. Production only runs
-- `migrate deploy`, so its database never received any of it - which is why
-- reading a user failed with "column profiles.passportUrl does not exist".
--
-- Every statement here is idempotent (IF NOT EXISTS / guarded DO blocks) so
-- this applies cleanly whether a database already has none, some or all of it.

-- ── UserStatus gains REJECTED ──
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- ── Profile fields ──
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "experienceYears" INTEGER;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "jobTitle"        TEXT;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "passportUrl"     TEXT;

-- ── Users: wallet flag and the pending-by-default signup status ──
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "walletEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- ── project_documents.type is set explicitly by the uploader ──
ALTER TABLE "project_documents" ALTER COLUMN "type" DROP DEFAULT;

-- ── KYC documents ──
CREATE TABLE IF NOT EXISTS "kyc_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- ── KPI tracking ──
CREATE TABLE IF NOT EXISTS "user_kpi_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_kpi_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_kpi_summary" (
    "userId" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_kpi_summary_pkey" PRIMARY KEY ("userId")
);

-- ── Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS, so guard each one) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kyc_documents_userId_fkey') THEN
    ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_kpi_logs_userId_fkey') THEN
    ALTER TABLE "user_kpi_logs" ADD CONSTRAINT "user_kpi_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_kpi_summary_userId_fkey') THEN
    ALTER TABLE "user_kpi_summary" ADD CONSTRAINT "user_kpi_summary_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
