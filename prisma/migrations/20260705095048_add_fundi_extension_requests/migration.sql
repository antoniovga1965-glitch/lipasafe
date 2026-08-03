-- CreateEnum
CREATE TYPE "ExtensionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "FundiJob" ADD COLUMN     "extensionRequestStatus" "ExtensionRequestStatus";

-- CreateTable
CREATE TABLE "FundiExtensionRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "extraHours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidencePhotos" TEXT[],
    "status" "ExtensionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundiExtensionRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FundiExtensionRequest" ADD CONSTRAINT "FundiExtensionRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
