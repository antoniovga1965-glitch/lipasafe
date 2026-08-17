/*
  Warnings:

  - The values [transfer_incoming] on the enum `NotificationType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `b2cCharge` to the `ProtectedTransfer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TransferPurpose" AS ENUM ('RENT', 'PURCHASE', 'SALARY', 'SCHOOL_FEES', 'LOAN', 'GIFT', 'OTHER');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('money_sent', 'money_received', 'payment_received', 'deliver_now', 'confirm_delivery', 'money_released', 'refund_sent', 'dispute_opened', 'dispute_resolved', 'auto_release_warning', 'account_frozen', 'house_payment_held', 'house_deal_accepted', 'house_deal_rejected', 'bundle_otp', 'otp_handover', 'auto_otp', 'inspection_expired', 'auto_release', 'transfer_received', 'transfer_sent', 'transfer_accepted', 'transfer_declined', 'transfer_cancelled', 'transfer_expired');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "FundiDispute" ADD COLUMN     "purpose" "TransferPurpose" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "HouseDispute" ADD COLUMN     "purpose" "TransferPurpose" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "transferId" TEXT;

-- AlterTable
ALTER TABLE "ProtectedTransfer" ADD COLUMN     "b2cCharge" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "purpose" "TransferPurpose" NOT NULL DEFAULT 'OTHER';

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
