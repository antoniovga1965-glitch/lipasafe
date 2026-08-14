/*
  Warnings:

  - A unique constraint covering the columns `[orderId,photoType,photoIndex]` on the table `DeliveryPhoto` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "DeliveryPhoto_orderId_photoType_key";

-- AlterTable
ALTER TABLE "DeliveryPhoto" ADD COLUMN     "photoIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPhoto_orderId_photoType_photoIndex_key" ON "DeliveryPhoto"("orderId", "photoType", "photoIndex");
