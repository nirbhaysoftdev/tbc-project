-- Deal-room media: images, PDFs and video on a project document.
--
-- Written by hand and guarded with IF NOT EXISTS to match the rest of this
-- directory: the development database has drifted from the migration history,
-- so this file has to reach the same end state from either starting point.
--
-- Existing project_documents rows keep their fileUrl and are backfilled to
-- kind = 'PDF', which is what every row created before this migration was.

ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "kind"       TEXT NOT NULL DEFAULT 'PDF';
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "mimeType"   TEXT;
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "sizeBytes"  INTEGER;
ALTER TABLE "project_documents" ADD COLUMN IF NOT EXISTS "uploadedBy" TEXT;

-- `type` gained an OTHER member and needs a default for uploads that are not
-- one of the named document categories.
ALTER TABLE "project_documents" ALTER COLUMN "type" SET DEFAULT 'OTHER';

CREATE INDEX IF NOT EXISTS "project_documents_projectId_idx" ON "project_documents"("projectId");
