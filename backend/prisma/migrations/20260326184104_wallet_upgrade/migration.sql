-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('INVESTMENT', 'WITHDRAWAL', 'PROFIT', 'PROFIT_ADJUSTMENT', 'ADMIN_CREDIT', 'ADMIN_DEBIT');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "balanceAfter" DOUBLE PRECISION,
ADD COLUMN     "category" "TransactionCategory";
