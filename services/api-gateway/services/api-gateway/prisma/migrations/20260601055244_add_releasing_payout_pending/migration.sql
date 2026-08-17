-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionState" ADD VALUE 'releasing';
ALTER TYPE "TransactionState" ADD VALUE 'payout_pending';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "payoutInitiatedAt" TIMESTAMP(3);
