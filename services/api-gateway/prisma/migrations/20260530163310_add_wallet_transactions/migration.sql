-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('send', 'receive', 'top_up', 'withdrawal', 'escrow_lock', 'escrow_release', 'refund', 'recall');

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "isGhost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recallAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "fromWalletId" TEXT,
    "toWalletId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
