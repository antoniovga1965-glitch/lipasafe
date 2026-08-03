/*
  Warnings:

  - A unique constraint covering the columns `[mpesaRef]` on the table `MpesaTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[idempotencyKey]` on the table `MpesaTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_mpesaRef_key" ON "MpesaTransaction"("mpesaRef");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_idempotencyKey_key" ON "MpesaTransaction"("idempotencyKey");
