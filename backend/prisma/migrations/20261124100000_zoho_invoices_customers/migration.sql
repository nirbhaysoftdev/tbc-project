ALTER TABLE "users" ADD COLUMN "zohoCustomerId" TEXT;
ALTER TABLE "receipts" ADD COLUMN "zohoPaymentId" TEXT,
ADD COLUMN "paymentRecordedAt" TIMESTAMP(3);
