-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HouseEscrowStatus" ADD VALUE 'PENDING_ACCEPTANCE';
ALTER TYPE "HouseEscrowStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "HouseEscrowStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "HouseEscrow" ADD COLUMN     "acceptanceDeadline" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING_ACCEPTANCE';

-- CreateIndex
CREATE INDEX "HouseEscrow_acceptanceDeadline_idx" ON "HouseEscrow"("acceptanceDeadline");
