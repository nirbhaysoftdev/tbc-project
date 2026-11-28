-- CreateEnum
CREATE TYPE "AladinoShareStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "aladino_share_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "allowLookup" BOOLEAN NOT NULL DEFAULT true,
    "totalShares" INTEGER NOT NULL DEFAULT 600,
    "pricePerShare" INTEGER NOT NULL DEFAULT 5000,
    "valuation" INTEGER NOT NULL DEFAULT 38000000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aladino_share_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aladino_share_bookings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "shares" INTEGER NOT NULL,
    "status" "AladinoShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aladino_share_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aladino_share_bookings_email_idx" ON "aladino_share_bookings"("email");

-- CreateIndex
CREATE INDEX "aladino_share_bookings_status_createdAt_idx" ON "aladino_share_bookings"("status", "createdAt");


-- The settings row the page reads; the defaults are the offering as first run.
INSERT INTO "aladino_share_settings" ("id", "updatedAt") VALUES ('default', CURRENT_TIMESTAMP);
