/*
  Warnings:

  - A unique constraint covering the columns `[clientRef]` on the table `WalletTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "WalletTxStatus" AS ENUM ('pending', 'completed', 'failed', 'reversed', 'recalled', 'disputed');

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "dailySendDate" TIMESTAMP(3),
ADD COLUMN     "dailySendTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "clientRef" TEXT,
ADD COLUMN     "status" "WalletTxStatus" NOT NULL DEFAULT 'completed';

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_clientRef_key" ON "WalletTransaction"("clientRef");
