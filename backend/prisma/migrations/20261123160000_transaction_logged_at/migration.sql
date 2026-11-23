-- loggedAt: when the row was written. Existing rows only have createdAt, which
-- is the closest thing to it.
ALTER TABLE "transactions" ADD COLUMN "loggedAt" TIMESTAMP(3);
UPDATE "transactions" SET "loggedAt" = "createdAt";
ALTER TABLE "transactions" ALTER COLUMN "loggedAt" SET NOT NULL,
ALTER COLUMN "loggedAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "transactions_userId_loggedAt_idx" ON "transactions"("userId", "loggedAt");
