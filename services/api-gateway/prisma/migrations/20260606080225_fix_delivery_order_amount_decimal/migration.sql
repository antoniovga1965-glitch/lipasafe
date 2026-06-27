/*
  Warnings:

  - You are about to alter the column `amount` on the `DeliveryOrder` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE "DeliveryOrder" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2);
