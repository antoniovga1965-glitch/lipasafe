-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "fundiJobId" TEXT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_fundiJobId_fkey" FOREIGN KEY ("fundiJobId") REFERENCES "FundiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
