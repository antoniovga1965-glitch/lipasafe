-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CUSTOM_DEAL_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOM_DEAL_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOM_DEAL_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOM_BUYER_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOM_PAYMENT_RELEASED';
