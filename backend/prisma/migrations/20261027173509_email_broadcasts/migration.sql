-- CreateEnum
CREATE TYPE "BroadcastAudienceMode" AS ENUM ('ALL', 'INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "BroadcastEmailState" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "BroadcastRecipientStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "email_broadcasts" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "intro" TEXT,
    "bodyText" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL_ACTIVE_MEMBERS',
    "audienceMode" "BroadcastAudienceMode" NOT NULL DEFAULT 'ALL',
    "audienceUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audienceSize" INTEGER NOT NULL DEFAULT 0,
    "adminId" TEXT,
    "adminName" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailState" "BroadcastEmailState" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "BroadcastRecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,

    CONSTRAINT "email_broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_broadcasts_idempotencyKey_key" ON "email_broadcasts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "email_broadcasts_createdAt_idx" ON "email_broadcasts"("createdAt");

-- CreateIndex
CREATE INDEX "email_broadcast_recipients_status_runAfter_idx" ON "email_broadcast_recipients"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "email_broadcast_recipients_broadcastId_email_key" ON "email_broadcast_recipients"("broadcastId", "email");

-- AddForeignKey
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_broadcast_recipients" ADD CONSTRAINT "email_broadcast_recipients_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "email_broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_broadcast_recipients" ADD CONSTRAINT "email_broadcast_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
