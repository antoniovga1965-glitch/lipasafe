-- AlterTable (safe — IF NOT EXISTS prevents duplicate column error)
ALTER TABLE "ProtectedTransfer" ADD COLUMN IF NOT EXISTS "deletedByRecipient" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProtectedTransfer" ADD COLUMN IF NOT EXISTS "deletedBySender" BOOLEAN NOT NULL DEFAULT false;
