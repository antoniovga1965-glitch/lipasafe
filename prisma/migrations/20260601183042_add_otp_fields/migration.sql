-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "otpCode" TEXT,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "smsDeliveryStatus" TEXT;
