-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('new', 'like_new', 'refurbished', 'good', 'fair', 'faulty');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'locked', 'sold', 'cancelled');

-- AlterEnum
ALTER TYPE "Category" ADD VALUE 'second_hand';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DisputeReason" ADD VALUE 'not_as_described';
ALTER TYPE "DisputeReason" ADD VALUE 'fake_or_clone';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TimerJobType" ADD VALUE 'inspection_deadline';
ALTER TYPE "TimerJobType" ADD VALUE 'handover_timeout';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "inspectionHours" INTEGER,
ADD COLUMN     "listingId" TEXT;

-- CreateTable
CREATE TABLE "SecondHandListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "condition" "ItemCondition" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "images" TEXT[],
    "conditionPhotos" TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "lockedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecondHandListing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "SecondHandListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecondHandListing" ADD CONSTRAINT "SecondHandListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
