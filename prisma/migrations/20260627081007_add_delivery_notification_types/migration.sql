-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NEW_DELIVERY_ORDER';
ALTER TYPE "NotificationType" ADD VALUE 'BEFORE_PHOTO_UPLOADED';
ALTER TYPE "NotificationType" ADD VALUE 'BEFORE_PHOTO_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'PICKUP_OTP_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'DELIVERY_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'RECEIPT_OTP_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_RELEASED';
