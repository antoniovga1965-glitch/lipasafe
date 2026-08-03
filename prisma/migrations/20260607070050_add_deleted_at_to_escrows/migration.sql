-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FundiJob" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HouseEscrow" ADD COLUMN     "deletedAt" TIMESTAMP(3);
