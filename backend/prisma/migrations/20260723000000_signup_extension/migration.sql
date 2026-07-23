-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PROFESSIONAL', 'BUSINESS');

-- AlterTable: passwordHash nullable for Google-signup users
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable: new User fields
ALTER TABLE "users" ADD COLUMN "accountType" "AccountType";
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- AlterTable: new Profile fields
ALTER TABLE "profiles" ADD COLUMN "phoneCountry" TEXT;
ALTER TABLE "profiles" ADD COLUMN "phoneDialCode" TEXT;
ALTER TABLE "profiles" ADD COLUMN "cvUrl" TEXT;
ALTER TABLE "profiles" ADD COLUMN "residentIdUrl" TEXT;
ALTER TABLE "profiles" ADD COLUMN "billingAddress" TEXT;
ALTER TABLE "profiles" ADD COLUMN "tradeLicenseUrl" TEXT;
ALTER TABLE "profiles" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "profiles" ADD COLUMN "businessAddress" TEXT;

-- CreateTable
CREATE TABLE "email_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SIGNUP',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_otps_email_purpose_idx" ON "email_otps"("email", "purpose");
