-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'ISSUED', 'DEAD');

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "zohoCustomerId" TEXT,
    "zohoReceiptId" TEXT,
    "receiptNumber" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "issuedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_investmentId_key" ON "receipts"("investmentId");

-- CreateIndex
CREATE INDEX "receipts_status_runAfter_idx" ON "receipts"("status", "runAfter");

-- CreateIndex
CREATE INDEX "receipts_userId_idx" ON "receipts"("userId");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "wallet_investments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

