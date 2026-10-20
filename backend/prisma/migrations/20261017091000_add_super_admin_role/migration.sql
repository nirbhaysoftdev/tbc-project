-- Super admin tier.
--
-- Purely additive: a third Role value plus two nullable columns. No existing
-- row changes meaning, and every existing ADMIN keeps its role.
--
-- `deletedAt` is the soft-delete marker. A row with it set is invisible to
-- every member-facing query and cannot log in, while the ledger keeps its
-- foreign keys intact. Purging the row outright is a separate action.
-- `deletedById` records which super admin did it.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt"   TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;

-- Every member-facing query filters on `deletedAt IS NULL`, so index the live
-- rows only; the deleted ones are read exclusively from the super-admin panel.
CREATE INDEX IF NOT EXISTS "users_deletedAt_idx" ON "users" ("deletedAt");
