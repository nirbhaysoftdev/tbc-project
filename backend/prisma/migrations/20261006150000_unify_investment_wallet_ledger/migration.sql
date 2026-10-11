-- Unify Deal Room -> investment -> wallet -> transaction into one ledger.
--
-- Written by hand and guarded with IF [NOT] EXISTS because the development
-- database had drifted from the migration history: an earlier `prisma db push`
-- created a first-draft investment engine (investment_projects,
-- wallet_investments, profit_configs, profit_records and the extra transactions
-- columns) that was never captured as a migration. Production has none of those
-- objects. The guards let this one file reach the same end state from either
-- starting point: it creates what is missing, then converges whatever already
-- exists onto the new shape with ALTERs rather than recreating it.
--
-- It must not modify existing rows in wallets, transactions, investments or
-- projects, with one unavoidable exception: projectId values that pointed at
-- the obsolete investment_projects catalogue are cleared, because capital is
-- now keyed on deal-room projects and those ids do not exist there.
--
-- The obsolete investment_projects table is intentionally left in place rather
-- than dropped; nothing references it any more and removing it is a separate,
-- deliberate decision.

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "ProfitType" AS ENUM ('ONE_TIME_AMOUNT', 'ONE_TIME_PERCENT', 'MONTHLY_PERCENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "ProfitRecordType" AS ENUM ('ONE_TIME', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "WalletInvestmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REJECTED', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "InvestmentRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Values missing from enums the earlier db push created.
ALTER TYPE "WalletInvestmentStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "TransactionCategory" ADD VALUE IF NOT EXISTS 'CAPITAL_RETURN';

-- ─── Transactions: project-aware ledger columns ───────────────────────────────

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "profitType" "ProfitType";
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "profitRate" DOUBLE PRECISION;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "investmentId" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "profitRecordId" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- ─── Wallet: withdrawal buckets ───────────────────────────────────────────────
-- investmentAmount / profitAmount keep their meaning as the manual opening
-- balance; existing values are deliberately left untouched.

ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "pendingWithdrawal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "wallets" ADD COLUMN IF NOT EXISTS "withdrawnProfit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ─── Investment requests ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "investment_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedAmount" DOUBLE PRECISION NOT NULL,
    "actualAmount" DOUBLE PRECISION,
    "message" TEXT,
    "status" "InvestmentRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "investment_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "investment_requests_userId_status_idx" ON "investment_requests"("userId", "status");
CREATE INDEX IF NOT EXISTS "investment_requests_status_idx" ON "investment_requests"("status");

-- ─── Wallet investments (capital) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "wallet_investments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "requestId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "returnedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "investedAt" TIMESTAMP(3) NOT NULL,
    "status" "WalletInvestmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "rejectionReason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "wallet_investments_pkey" PRIMARY KEY ("id")
);

-- Converge a first-draft table, if that is what we found.
ALTER TABLE "wallet_investments" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
ALTER TABLE "wallet_investments" ADD COLUMN IF NOT EXISTS "returnedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "wallet_investments" ALTER COLUMN "projectId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_investments_requestId_key" ON "wallet_investments"("requestId");
CREATE INDEX IF NOT EXISTS "wallet_investments_userId_projectId_idx" ON "wallet_investments"("userId", "projectId");

-- ─── Profit configuration ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "profit_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "profitType" "ProfitType" NOT NULL DEFAULT 'MONTHLY_PERCENT',
    "rate" DOUBLE PRECISION NOT NULL,
    "monthlyProfitDay" INTEGER NOT NULL DEFAULT 15,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profit_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "profit_configs" ALTER COLUMN "projectId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "profit_configs_userId_projectId_active_idx" ON "profit_configs"("userId", "projectId", "active");

-- ─── Profit records ───────────────────────────────────────────────────────────
-- scopeKey is projectId or the literal 'NO_PROJECT'. It exists so the
-- uniqueness guard also covers project-less profit: Postgres treats NULLs as
-- distinct, so a unique index over a nullable projectId would let the monthly
-- job double-pay the same project-less cycle.

CREATE TABLE IF NOT EXISTS "profit_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT,
    "type" "ProfitRecordType" NOT NULL,
    "period" TEXT NOT NULL,
    "capitalSnapshot" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdBy" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profit_records_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "profit_records" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT;
ALTER TABLE "profit_records" ALTER COLUMN "projectId" DROP NOT NULL;
UPDATE "profit_records" SET "scopeKey" = COALESCE("projectId", 'NO_PROJECT') WHERE "scopeKey" IS NULL;
ALTER TABLE "profit_records" ALTER COLUMN "scopeKey" SET NOT NULL;

ALTER TABLE "profit_records" DROP CONSTRAINT IF EXISTS "profit_records_userId_projectId_period_key";
DROP INDEX IF EXISTS "profit_records_userId_projectId_period_key";
CREATE UNIQUE INDEX IF NOT EXISTS "profit_records_userId_scopeKey_period_key" ON "profit_records"("userId", "scopeKey", "period");

-- ─── Repoint capital/profit at deal-room projects ─────────────────────────────
-- Old rows pointed at the obsolete investment_projects catalogue; those ids do
-- not exist in projects, so they are cleared to NULL (a project-less
-- investment, which is a fully supported state) rather than being deleted.

ALTER TABLE "transactions"       DROP CONSTRAINT IF EXISTS "transactions_projectId_fkey";
ALTER TABLE "wallet_investments" DROP CONSTRAINT IF EXISTS "wallet_investments_projectId_fkey";
ALTER TABLE "profit_configs"     DROP CONSTRAINT IF EXISTS "profit_configs_projectId_fkey";
ALTER TABLE "profit_records"     DROP CONSTRAINT IF EXISTS "profit_records_projectId_fkey";

UPDATE "transactions" t SET "projectId" = NULL
WHERE t."projectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = t."projectId");

UPDATE "wallet_investments" w SET "projectId" = NULL
WHERE w."projectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = w."projectId");

UPDATE "profit_configs" c SET "projectId" = NULL
WHERE c."projectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = c."projectId");

UPDATE "profit_records" r SET "projectId" = NULL, "scopeKey" = 'NO_PROJECT'
WHERE r."projectId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = r."projectId");

-- ─── Foreign keys ─────────────────────────────────────────────────────────────

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "investment_requests" DROP CONSTRAINT IF EXISTS "investment_requests_userId_fkey";
ALTER TABLE "investment_requests" ADD CONSTRAINT "investment_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "investment_requests" DROP CONSTRAINT IF EXISTS "investment_requests_projectId_fkey";
ALTER TABLE "investment_requests" ADD CONSTRAINT "investment_requests_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_investments" DROP CONSTRAINT IF EXISTS "wallet_investments_userId_fkey";
ALTER TABLE "wallet_investments" ADD CONSTRAINT "wallet_investments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_investments" ADD CONSTRAINT "wallet_investments_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallet_investments" DROP CONSTRAINT IF EXISTS "wallet_investments_requestId_fkey";
ALTER TABLE "wallet_investments" ADD CONSTRAINT "wallet_investments_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "investment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "profit_configs" DROP CONSTRAINT IF EXISTS "profit_configs_userId_fkey";
ALTER TABLE "profit_configs" ADD CONSTRAINT "profit_configs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profit_configs" ADD CONSTRAINT "profit_configs_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "profit_records" DROP CONSTRAINT IF EXISTS "profit_records_userId_fkey";
ALTER TABLE "profit_records" ADD CONSTRAINT "profit_records_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profit_records" ADD CONSTRAINT "profit_records_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
