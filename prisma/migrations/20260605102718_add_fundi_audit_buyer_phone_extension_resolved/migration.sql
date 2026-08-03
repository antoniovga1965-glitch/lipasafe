-- AlterEnum
ALTER TYPE "FundiJobStatus" ADD VALUE 'RESOLVED';

-- AlterTable
ALTER TABLE "FundiJob" ADD COLUMN     "buyerPhone" TEXT,
ADD COLUMN     "extensionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FundiAuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "jobId" TEXT,
    "userId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundiAuditLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FundiAuditLog" ADD CONSTRAINT "FundiAuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiAuditLog" ADD CONSTRAINT "FundiAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
