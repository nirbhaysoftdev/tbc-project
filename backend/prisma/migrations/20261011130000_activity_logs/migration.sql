-- Activity log: emails, member requests/approvals, investment requests,
-- profit, withdrawals and anything else worth auditing.
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "targetId" TEXT,
    "targetName" TEXT,
    "amount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");
CREATE INDEX "activity_logs_type_createdAt_idx" ON "activity_logs"("type", "createdAt");
CREATE INDEX "activity_logs_category_createdAt_idx" ON "activity_logs"("category", "createdAt");
CREATE INDEX "activity_logs_targetId_createdAt_idx" ON "activity_logs"("targetId", "createdAt");

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_targetId_fkey"
    FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
