-- CreateEnum
CREATE TYPE "RequestPurpose" AS ENUM ('RENT', 'SALARY', 'SCHOOL_FEES', 'PURCHASE', 'LOAN', 'GIFT', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "RequestMoney" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "recipientPays" DECIMAL(12,2) NOT NULL,
    "purpose" "RequestPurpose" NOT NULL,
    "note" TEXT,
    "state" "RequestState" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "checkoutRequestId" TEXT,
    "mpesaRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestMoney_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RequestMoney_checkoutRequestId_key" ON "RequestMoney"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "RequestMoney_requesterId_idx" ON "RequestMoney"("requesterId");

-- CreateIndex
CREATE INDEX "RequestMoney_recipientPhone_idx" ON "RequestMoney"("recipientPhone");

-- CreateIndex
CREATE INDEX "RequestMoney_state_idx" ON "RequestMoney"("state");

-- AddForeignKey
ALTER TABLE "RequestMoney" ADD CONSTRAINT "RequestMoney_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMoney" ADD CONSTRAINT "RequestMoney_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
