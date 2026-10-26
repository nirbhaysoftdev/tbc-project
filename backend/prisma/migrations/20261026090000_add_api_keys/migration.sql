-- Machine access to the read-only API: one row per consumer.
--
-- Written by hand rather than by `migrate dev`, because this database carries
-- one deliberate, permanent piece of drift - migration
-- 20261006150000_unify_investment_wallet_ledger left the obsolete, empty
-- `investment_projects` table in place on purpose - and `migrate dev` responds
-- to any drift by offering to reset the development database. `migrate deploy`
-- applies this the same way production will. If you add to this schema, do the
-- same: generate the SQL with
--
--   npx prisma migrate diff --from-url "$DATABASE_URL" \
--       --to-schema-datamodel prisma/schema.prisma --script
--
-- and DROP the `DROP TABLE "investment_projects"` line it emits.
--
-- No column here holds a usable credential: `keyHash` is a SHA-256 digest and
-- `keyPrefix` is the first 16 characters, kept only so a key can be recognised
-- in the panel. A dump of this table cannot be used to call the API.
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "rotatedFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- Unique, so authenticating a presented key is one indexed lookup by digest.
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

CREATE INDEX "api_keys_revokedAt_idx" ON "api_keys"("revokedAt");

-- A deleted admin does not take their issued keys with them: the key keeps
-- working and the record of who created it simply goes null.
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
