-- AlterTable
ALTER TABLE "ProtectedTransfer" ADD COLUMN     "deletedByRecipient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletedBySender" BOOLEAN NOT NULL DEFAULT false;
