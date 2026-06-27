-- CreateEnum
CREATE TYPE "FundiJobStatus" AS ENUM ('PENDING_PAYMENT', 'WAITING_FOR_FUNDI_ACCEPTANCE', 'ACTIVE', 'AWAITING_BUYER_REVIEW', 'OVERDUE', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'DISPUTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FundiDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "FundiDisputeResult" AS ENUM ('FULL_REFUND', 'FULL_RELEASE', 'PARTIAL');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "mpesaRef" TEXT;

-- CreateTable
CREATE TABLE "FundiJob" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "fundiPhone" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "serviceFee" DECIMAL(10,2) NOT NULL,
    "totalCharged" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "status" "FundiJobStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "beforePhotos" TEXT[],
    "afterPhotos" TEXT[],
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpLockedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "inspectionDeadlineAt" TIMESTAMP(3),
    "overdueSentAt" TIMESTAMP(3),
    "mpesaCheckoutId" TEXT,
    "mpesaRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundiEscrow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "partialReleasedAmount" DECIMAL(10,2),
    "partialRefundAmount" DECIMAL(10,2),

    CONSTRAINT "FundiEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundiDispute" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "evidencePhotos" TEXT[],
    "decision" "FundiDisputeResult",
    "refundAmount" DECIMAL(10,2),
    "releaseAmount" DECIMAL(10,2),
    "status" "FundiDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundiDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundiSmsReply" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,

    CONSTRAINT "FundiSmsReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundiMpesaTransaction" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "totalCharged" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesaRef" TEXT,
    "idempotencyKey" TEXT,
    "resultDesc" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundiMpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FundiJob_mpesaCheckoutId_key" ON "FundiJob"("mpesaCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiEscrow_jobId_key" ON "FundiEscrow"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiDispute_jobId_key" ON "FundiDispute"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiMpesaTransaction_jobId_key" ON "FundiMpesaTransaction"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiMpesaTransaction_checkoutRequestId_key" ON "FundiMpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiMpesaTransaction_mpesaRef_key" ON "FundiMpesaTransaction"("mpesaRef");

-- CreateIndex
CREATE UNIQUE INDEX "FundiMpesaTransaction_idempotencyKey_key" ON "FundiMpesaTransaction"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "FundiJob" ADD CONSTRAINT "FundiJob_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiEscrow" ADD CONSTRAINT "FundiEscrow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiDispute" ADD CONSTRAINT "FundiDispute_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiDispute" ADD CONSTRAINT "FundiDispute_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiSmsReply" ADD CONSTRAINT "FundiSmsReply_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
