-- Share offerings: one settings row per offering, and each booking records the
-- page it came from. Existing rows are the Aladino offering.
ALTER TABLE "aladino_share_settings" ALTER COLUMN "id" DROP DEFAULT;
UPDATE "aladino_share_settings" SET "id" = 'aladino' WHERE "id" = 'default';

ALTER TABLE "aladino_share_bookings" ADD COLUMN "offering" TEXT NOT NULL DEFAULT 'aladino';
CREATE INDEX "aladino_share_bookings_offering_status_idx" ON "aladino_share_bookings"("offering", "status");

INSERT INTO "aladino_share_settings" ("id", "totalShares", "pricePerShare", "valuation", "updatedAt")
VALUES ('real-estate', 350, 10000, 3500000, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
