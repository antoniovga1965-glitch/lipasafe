/*
  Warnings:

  - The values [PICKUP_OTP,DELIVERY_OTP] on the enum `DeliveryOTPType` will be removed. If these variants are still used in the database, this will fail.
  - The values [PICKUP_OTP_ISSUED] on the enum `DeliveryStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[mpesaCheckoutId]` on the table `DeliveryOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mpesaRef]` on the table `DeliveryOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryOTPType_new" AS ENUM ('PICKUP', 'DELIVERY');
ALTER TABLE "DeliveryOTP" ALTER COLUMN "otpType" TYPE "DeliveryOTPType_new" USING ("otpType"::text::"DeliveryOTPType_new");
ALTER TYPE "DeliveryOTPType" RENAME TO "DeliveryOTPType_old";
ALTER TYPE "DeliveryOTPType_new" RENAME TO "DeliveryOTPType";
DROP TYPE "public"."DeliveryOTPType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryStatus_new" AS ENUM ('PENDING_PAYMENT', 'PENDING_PHOTO_UPLOAD', 'PHOTO_WAITING_BUYER_CONFIRMATION', 'PHOTO_CONFIRMED_BY_BUYER', 'PICKUP_ISSUED', 'IN_TRANSIT', 'DELIVERY_PHOTO_UPLOADED', 'AWAITING_RECEIPT', 'RECEIPT_OTP_ISSUED', 'AWAITING_RELEASE_WINDOW', 'PAYMENT_PROCESSING', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'PAYMENT_FAILED', 'DELIVERY_TIMEOUT');
ALTER TABLE "public"."DeliveryOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "DeliveryOrder" ALTER COLUMN "status" TYPE "DeliveryStatus_new" USING ("status"::text::"DeliveryStatus_new");
ALTER TYPE "DeliveryStatus" RENAME TO "DeliveryStatus_old";
ALTER TYPE "DeliveryStatus_new" RENAME TO "DeliveryStatus";
DROP TYPE "public"."DeliveryStatus_old";
ALTER TABLE "DeliveryOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING_PHOTO_UPLOAD';
COMMIT;

-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN     "mpesaCheckoutId" TEXT,
ADD COLUMN     "mpesaRef" TEXT,
ADD COLUMN     "productDescription" TEXT;

-- CreateTable
CREATE TABLE "DeliveryMpesaTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "totalCharged" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesaRef" TEXT,
    "resultDesc" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryMpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEscrow" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "heldAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMpesaTransaction_orderId_key" ON "DeliveryMpesaTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMpesaTransaction_checkoutRequestId_key" ON "DeliveryMpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMpesaTransaction_mpesaRef_key" ON "DeliveryMpesaTransaction"("mpesaRef");

-- CreateIndex
CREATE INDEX "DeliveryMpesaTransaction_orderId_idx" ON "DeliveryMpesaTransaction"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryMpesaTransaction_status_idx" ON "DeliveryMpesaTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEscrow_orderId_key" ON "DeliveryEscrow"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryEscrow_orderId_idx" ON "DeliveryEscrow"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryEscrow_status_idx" ON "DeliveryEscrow"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_mpesaCheckoutId_key" ON "DeliveryOrder"("mpesaCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_mpesaRef_key" ON "DeliveryOrder"("mpesaRef");

-- AddForeignKey
ALTER TABLE "DeliveryMpesaTransaction" ADD CONSTRAINT "DeliveryMpesaTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEscrow" ADD CONSTRAINT "DeliveryEscrow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
