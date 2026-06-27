-- AlterTable
ALTER TABLE "MpesaTransaction" ADD COLUMN     "callbackPhone" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "merchantRequestId" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "resultDesc" TEXT;
