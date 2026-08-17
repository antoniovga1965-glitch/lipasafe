-- CreateIndex
CREATE INDEX "WalletTransaction_fromWalletId_createdAt_idx" ON "WalletTransaction"("fromWalletId", "createdAt");
