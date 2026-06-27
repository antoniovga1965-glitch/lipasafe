/*
  Warnings:

  - A unique constraint covering the columns `[transactionId,payoutType]` on the table `Payout` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Payout_transactionId_key";

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "payoutType" TEXT NOT NULL DEFAULT 'full';

-- CreateIndex
CREATE UNIQUE INDEX "Payout_transactionId_payoutType_key" ON "Payout"("transactionId", "payoutType");
