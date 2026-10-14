-- One portal-wide enquiry recipient, instead of one per project and company.
--
-- 20261014150000_connect_now_enquiries put an `enquiryEmail` column on both
-- `projects` and `companies`. That turned out to be the wrong shape: the
-- address had to be set again on every item an admin created, and answering
-- "where do enquiries go?" meant opening every record. It is now a single
-- value in `system_config` under the key `enquiryRecipientEmail`, managed from
-- the Admin Panel (services/enquirySettings.js).
--
-- The columns are dropped rather than left in place. A column nothing reads is
-- worse than no column: an admin would keep filling it in and enquiries would
-- keep going somewhere else, with nothing to explain why.
--
-- Any address already stored on a project or company is carried over to the
-- global setting before the columns go, so a configured recipient is not lost.
-- The most recently updated one wins; in practice there is at most one, since
-- the per-item fields existed for a single day.
--
-- The id is a fixed literal rather than gen_random_uuid(): that function is
-- only in core from PostgreSQL 13, and nothing else in this project installs
-- pgcrypto, so calling it would make this migration fail on an older server.
-- `SystemConfig.id` is a plain String, so any stable unique value is fine.
INSERT INTO "system_config" ("id", "key", "value", "updatedAt")
SELECT 'cfg-enquiry-recipient-email', 'enquiryRecipientEmail', "enquiryEmail", NOW()
  FROM (
    SELECT "enquiryEmail", "updatedAt" FROM "projects"
     WHERE "enquiryEmail" IS NOT NULL AND "enquiryEmail" <> ''
    UNION ALL
    SELECT "enquiryEmail", "updatedAt" FROM "companies"
     WHERE "enquiryEmail" IS NOT NULL AND "enquiryEmail" <> ''
  ) AS configured
 ORDER BY "updatedAt" DESC
 LIMIT 1
ON CONFLICT ("key") DO NOTHING;

ALTER TABLE "projects"  DROP COLUMN IF EXISTS "enquiryEmail";
ALTER TABLE "companies" DROP COLUMN IF EXISTS "enquiryEmail";
