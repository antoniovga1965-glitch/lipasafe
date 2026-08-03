-- CreateEnum
CREATE TYPE "CustomEscrowStatus" AS ENUM ('PENDING_ACCEPTANCE', 'REJECTED', 'ACCEPTED', 'PENDING_PAYMENT', 'PAYMENT_INITIATING', 'PAYMENT_HELD', 'BUYER_CONFIRMED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomEscrow" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "counterpartyPhone" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "counterpartyReceives" DECIMAL(12,2) NOT NULL,
    "isRisky" BOOLEAN NOT NULL DEFAULT false,
    "riskDescription" TEXT,
    "riskPhotos" TEXT[],
    "additionalNotes" TEXT,
    "completionHours" INTEGER,
    "deadline" TIMESTAMP(3),
    "status" "CustomEscrowStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "mpesaCheckoutId" TEXT,
    "mpesaRef" TEXT,
    "buyerConfirmedAt" TIMESTAMP(3),
    "counterpartyConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payoutQueuedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomMpesaTransaction" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "mpesaRef" TEXT,
    "resultDesc" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomMpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDispute" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "openedByRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "buyerAmount" DECIMAL(12,2),
    "sellerAmount" DECIMAL(12,2),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAuditLog" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomEscrow_mpesaCheckoutId_key" ON "CustomEscrow"("mpesaCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomMpesaTransaction_checkoutRequestId_key" ON "CustomMpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomMpesaTransaction_idempotencyKey_key" ON "CustomMpesaTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDispute_escrowId_key" ON "CustomDispute"("escrowId");

-- AddForeignKey
ALTER TABLE "CustomEscrow" ADD CONSTRAINT "CustomEscrow_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMpesaTransaction" ADD CONSTRAINT "CustomMpesaTransaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDispute" ADD CONSTRAINT "CustomDispute_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAuditLog" ADD CONSTRAINT "CustomAuditLog_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
