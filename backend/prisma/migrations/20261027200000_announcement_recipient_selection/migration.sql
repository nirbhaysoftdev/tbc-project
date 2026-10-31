-- Recipient selection for project launches and major updates.
--
-- Written by hand, as CLAUDE.md requires: this database carries one
-- deliberate, permanent piece of drift (the obsolete, empty
-- `investment_projects` table), so `migrate dev` offers to reset development.
-- The SQL below is `migrate diff`'s output with its `DROP TABLE
-- "investment_projects"` line removed.
--
-- Every existing announcement becomes ALL, which is what it was: it went to
-- the whole audience, because narrowing it was not possible yet.

-- CreateEnum
CREATE TYPE "AnnouncementAudienceMode" AS ENUM ('ALL', 'INCLUDE', 'EXCLUDE');

-- AlterTable
ALTER TABLE "project_announcements" ADD COLUMN     "audienceMode" "AnnouncementAudienceMode" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "audienceSize" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "audienceUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- The audience size of an announcement written before this column existed is
-- the number of recipients it was queued for: with no narrowing possible, the
-- send list WAS the audience.
UPDATE "project_announcements" SET "audienceSize" = "recipientCount";
