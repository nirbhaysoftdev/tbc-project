-- Translation store for the multilingual system.
--
-- Purely additive: one nullable column on `users` and three new tables. No
-- existing column is altered, renamed or dropped, and no existing row changes
-- meaning, so this is safe to apply to production with live data and safe to
-- roll back by dropping only what it creates (see the DOWN notes at the end).
--
-- Every statement is guarded so a re-run cannot fail. This project has been
-- bitten by schema drift between dev and production before (see
-- 20261011140000_repair_schema_drift), and an idempotent migration is the
-- cheapest insurance against a half-applied state.

-- ── Enums ────────────────────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, so each is wrapped in a DO block.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TranslationStatus') THEN
    CREATE TYPE "TranslationStatus" AS ENUM ('MACHINE', 'HUMAN_REVIEWED', 'OUTDATED', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TranslationJobStatus') THEN
    CREATE TYPE "TranslationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'DEAD');
  END IF;
END $$;

-- ── users.locale ─────────────────────────────────────────────────────────────
-- Nullable with no default: NULL means "this member has never chosen a
-- language", which is what keeps browser detection in play on a new device.
-- Giving it a default of 'en' would be wrong — it would make every existing
-- member look like they had explicitly chosen English.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" TEXT;

-- ── translations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "translations" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "TranslationStatus" NOT NULL DEFAULT 'MACHINE',
    "format" TEXT NOT NULL DEFAULT 'text',
    "provider" TEXT,
    "providerModel" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- ── translation_jobs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "translation_jobs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL DEFAULT 1,
    "format" TEXT NOT NULL DEFAULT 'text',
    "status" "TranslationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translation_jobs_pkey" PRIMARY KEY ("id")
);

-- ── content_versions ─────────────────────────────────────────────────────────
-- Composite primary key rather than a surrogate id: there is exactly one
-- version row per (entityType, entityId), and that is the lookup key.

CREATE TABLE IF NOT EXISTS "content_versions" (
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldHashes" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_versions_pkey" PRIMARY KEY ("entityType","entityId")
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- The unique index on (entityType, entityId, field, language) is the load-
-- bearing one: it makes a duplicate translation physically impossible and lets
-- the writer be a single upsert instead of a read-then-write race.

CREATE INDEX IF NOT EXISTS "translations_entityType_entityId_idx"
  ON "translations"("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "translations_status_idx"
  ON "translations"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "translations_entityType_entityId_field_language_key"
  ON "translations"("entityType", "entityId", "field", "language");

-- Drives the worker's claim query: WHERE status IN (...) AND runAfter <= now().
CREATE INDEX IF NOT EXISTS "translation_jobs_status_runAfter_idx"
  ON "translation_jobs"("status", "runAfter");

-- Collapses concurrent requests for the same content+language onto one job row.
CREATE UNIQUE INDEX IF NOT EXISTS "translation_jobs_entityType_entityId_field_language_sourceH_key"
  ON "translation_jobs"("entityType", "entityId", "field", "language", "sourceHash");

-- ── Reverting ────────────────────────────────────────────────────────────────
-- Prisma does not generate down-migrations, so the rollback is recorded here
-- for an operator who needs it. It touches nothing that existed beforehand:
--
--   DROP TABLE IF EXISTS "translation_jobs";
--   DROP TABLE IF EXISTS "translations";
--   DROP TABLE IF EXISTS "content_versions";
--   DROP TYPE  IF EXISTS "TranslationJobStatus";
--   DROP TYPE  IF EXISTS "TranslationStatus";
--   ALTER TABLE "users" DROP COLUMN IF EXISTS "locale";
--
-- Dropping users.locale discards saved language preferences; members simply
-- fall back to browser detection, so the rollback is lossy but not breaking.
