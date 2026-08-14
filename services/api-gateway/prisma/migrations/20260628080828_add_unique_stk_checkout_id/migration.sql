/*
  Warnings:

  - A unique constraint covering the columns `[stkCheckoutId]` on the table `ProtectedTransfer` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ProtectedTransfer_stkCheckoutId_key" ON "ProtectedTransfer"("stkCheckoutId");
