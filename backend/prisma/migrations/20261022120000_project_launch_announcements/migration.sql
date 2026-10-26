-- Project lifecycle: official launch, announcement history, "Newly Launched".
--
-- EVERYTHING HERE IS ADDITIVE AND SILENT. Requirement §8 is explicit that
-- deploying this must not launch anything, send anything, announce anything or
-- change any project's visibility, so this migration:
--
--   * adds columns that are nullable or defaulted - no project's existing
--     behaviour changes;
--   * writes no announcement rows, so no email is ever queued (the queue IS
--     the recipient table, which starts empty);
--   * leaves `status` untouched, so a DRAFT stays a draft, an inactive project
--     stays inactive and an archived one stays archived;
--   * leaves `newlyLaunchedUntil` null everywhere, so no badge appears.
--
-- The ONE data change is the classification at the bottom, which records what
-- is already true rather than deciding anything.

-- CreateEnum
CREATE TYPE "ProjectLaunchState" AS ENUM ('NEVER_LAUNCHED', 'PRE_FEATURE', 'LAUNCHED');

-- CreateEnum
CREATE TYPE "ProjectAnnouncementType" AS ENUM ('INITIAL_LAUNCH', 'MAJOR_UPDATE', 'PROMO_RESTART');

-- CreateEnum
CREATE TYPE "AnnouncementEmailState" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "AnnouncementRecipientStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'DEAD');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "launchState" "ProjectLaunchState" NOT NULL DEFAULT 'NEVER_LAUNCHED',
ADD COLUMN     "launchedAt" TIMESTAMP(3),
ADD COLUMN     "launchedById" TEXT,
ADD COLUMN     "newlyLaunchedUntil" TIMESTAMP(3),
ADD COLUMN     "promoRestartCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promoStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "project_announcements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProjectAnnouncementType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "updateCategory" TEXT,
    "audience" TEXT NOT NULL DEFAULT 'ALL_ACTIVE_MEMBERS',
    "adminId" TEXT,
    "adminName" TEXT,
    "postId" TEXT,
    "notifiedCount" INTEGER NOT NULL DEFAULT 0,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "emailState" "AnnouncementEmailState" NOT NULL DEFAULT 'PENDING',
    "promoStartedAt" TIMESTAMP(3),
    "promoEndsAt" TIMESTAMP(3),
    "promoReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_announcement_recipients" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "AnnouncementRecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,

    CONSTRAINT "project_announcement_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_announcements_idempotencyKey_key" ON "project_announcements"("idempotencyKey");

-- CreateIndex
CREATE INDEX "project_announcements_projectId_createdAt_idx" ON "project_announcements"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "project_announcement_recipients_status_runAfter_idx" ON "project_announcement_recipients"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "project_announcement_recipients_announcementId_email_key" ON "project_announcement_recipients"("announcementId", "email");

-- CreateIndex
CREATE INDEX "projects_launchState_idx" ON "projects"("launchState");

-- CreateIndex
CREATE INDEX "projects_newlyLaunchedUntil_idx" ON "projects"("newlyLaunchedUntil");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_launchedById_fkey" FOREIGN KEY ("launchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_announcements" ADD CONSTRAINT "project_announcements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_announcements" ADD CONSTRAINT "project_announcements_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_announcement_recipients" ADD CONSTRAINT "project_announcement_recipients_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "project_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_announcement_recipients" ADD CONSTRAINT "project_announcement_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Classify what already exists (§8) ───────────────────────────────────────
--
-- Two kinds of existing project have to be told apart, and neither may be
-- given a launch date that nobody actually knows:
--
--   published before this module existed  ->  PRE_FEATURE
--       ACTIVE, FUNDED and CLOSED projects were visible to members before
--       there was any such thing as an official launch. They were launched in
--       the informal sense, so calling them NEVER_LAUNCHED would be wrong and
--       would offer an admin a "first launch" that would mail the community
--       about a project it has been looking at for months.
--
--   never published                       ->  NEVER_LAUNCHED (the default)
--       DRAFT and CANCELLED projects. Nothing to preserve.
--
-- `launchedAt` is deliberately left NULL for PRE_FEATURE rows. The date is not
-- recoverable from anything on the row - `createdAt` is when the record was
-- made, which is not when the project launched - and §8 says not to fabricate
-- one. The admin panel surfaces every PRE_FEATURE project as needing a
-- decision: launch it officially now, or classify it as previously launched
-- and leave the unknown date unknown. Neither happens on its own.
UPDATE "projects"
   SET "launchState" = 'PRE_FEATURE'
 WHERE "status" IN ('ACTIVE', 'FUNDED', 'CLOSED');
