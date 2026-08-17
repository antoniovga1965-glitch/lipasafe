-- CreateEnum
CREATE TYPE "HouseEscrowStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_HELD', 'CONFIRMED', 'DISPUTED', 'ESCALATED', 'REFUNDED', 'COMPLETED', 'AUTO_RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HouseDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "HouseDisputeResult" AS ENUM ('FULL_REFUND', 'FULL_RELEASE', 'PARTIAL');

-- CreateTable
CREATE TABLE "HouseEscrow" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "description" TEXT NOT NULL,
    "address" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2),
    "sellerReceives" DECIMAL(10,2),
    "status" "HouseEscrowStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "mpesaCheckoutId" TEXT,
    "mpesaRef" TEXT,
    "idempotencyKey" TEXT,
    "inspectionHours" INTEGER NOT NULL DEFAULT 24,
    "inspectionDeadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "autoReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseDispute" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "buyerPhotos" TEXT[],
    "adminNotes" TEXT,
    "decision" "HouseDisputeResult",
    "status" "HouseDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseMpesaTransaction" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesaRef" TEXT,
    "idempotencyKey" TEXT,
    "resultDesc" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseMpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseAuditLog" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT,
    "action" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseEscrow_mpesaCheckoutId_key" ON "HouseEscrow"("mpesaCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseEscrow_mpesaRef_key" ON "HouseEscrow"("mpesaRef");

-- CreateIndex
CREATE UNIQUE INDEX "HouseEscrow_idempotencyKey_key" ON "HouseEscrow"("idempotencyKey");

-- CreateIndex
CREATE INDEX "HouseEscrow_status_idx" ON "HouseEscrow"("status");

-- CreateIndex
CREATE INDEX "HouseEscrow_buyerId_idx" ON "HouseEscrow"("buyerId");

-- CreateIndex
CREATE INDEX "HouseEscrow_inspectionDeadline_idx" ON "HouseEscrow"("inspectionDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "HouseDispute_escrowId_key" ON "HouseDispute"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseMpesaTransaction_escrowId_key" ON "HouseMpesaTransaction"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseMpesaTransaction_checkoutRequestId_key" ON "HouseMpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseMpesaTransaction_mpesaRef_key" ON "HouseMpesaTransaction"("mpesaRef");

-- CreateIndex
CREATE UNIQUE INDEX "HouseMpesaTransaction_idempotencyKey_key" ON "HouseMpesaTransaction"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "HouseEscrow" ADD CONSTRAINT "HouseEscrow_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseDispute" ADD CONSTRAINT "HouseDispute_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "HouseEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseMpesaTransaction" ADD CONSTRAINT "HouseMpesaTransaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "HouseEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseAuditLog" ADD CONSTRAINT "HouseAuditLog_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "HouseEscrow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
