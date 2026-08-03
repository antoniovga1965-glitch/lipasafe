-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_houseEscrowId_fkey" FOREIGN KEY ("houseEscrowId") REFERENCES "HouseEscrow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
