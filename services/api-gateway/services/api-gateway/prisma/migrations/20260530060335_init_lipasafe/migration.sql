-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('buyer', 'seller', 'both', 'admin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'frozen', 'banned');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('bundles', 'delivery', 'fundi', 'house_agent', 'freelancer', 'goods_seller', 'other');

-- CreateEnum
CREATE TYPE "TransactionState" AS ENUM ('initiated', 'payment_pending', 'held', 'delivered', 'confirmed', 'disputed', 'resolved', 'released', 'refunded', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "MilestoneState" AS ENUM ('pending', 'delivered', 'confirmed', 'released', 'disputed');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('not_delivered', 'wrong_item', 'damaged_goods', 'service_incomplete', 'fraud_suspected', 'other');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'escalated');

-- CreateEnum
CREATE TYPE "ResolutionAction" AS ENUM ('full_refund', 'full_release', 'partial_refund', 'partial_release');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('payment_received', 'deliver_now', 'confirm_delivery', 'money_released', 'refund_sent', 'dispute_opened', 'dispute_resolved', 'auto_release_warning', 'account_frozen');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'push', 'whatsapp');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'delivered');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('velocity_breach', 'same_device_buyer_seller', 'same_ip_buyer_seller', 'new_account_large_amount', 'high_dispute_rate', 'sim_swap_detected', 'bot_behavior', 'pattern_anomaly', 'amount_structuring');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "SignalAction" AS ENUM ('logged', 'flagged', 'blocked', 'frozen');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'admin', 'system');

-- CreateEnum
CREATE TYPE "TimerJobType" AS ENUM ('delivery_reminder', 'auto_release', 'dispute_deadline', 'payment_expiry', 'confirmation_reminder');

-- CreateEnum
CREATE TYPE "TimerJobStatus" AS ENUM ('pending', 'fired', 'cancelled', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'unverified',
    "role" "Role" NOT NULL DEFAULT 'buyer',
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'active',
    "reputationScore" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "totalTransactions" INTEGER NOT NULL DEFAULT 0,
    "totalDisputed" INTEGER NOT NULL DEFAULT 0,
    "totalCompleted" INTEGER NOT NULL DEFAULT 0,
    "simLastChanged" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "category" "Category" NOT NULL,
    "idNumber" TEXT,
    "idDocUrl" TEXT,
    "faceVerified" BOOLEAN NOT NULL DEFAULT false,
    "tillNumber" TEXT,
    "transactionLimit" DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    "totalEarned" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "availableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "escrowBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "pendingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "totalIn" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "totalOut" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2),
    "sellerReceives" DECIMAL(10,2),
    "category" "Category" NOT NULL,
    "description" TEXT,
    "state" "TransactionState" NOT NULL DEFAULT 'initiated',
    "mpesaCheckoutId" TEXT,
    "mpesaReceipt" TEXT,
    "buyerPhone" TEXT,
    "sellerTill" TEXT,
    "paymentDeadline" TIMESTAMP(3),
    "deliveryDeadline" TIMESTAMP(3),
    "confirmationDeadline" TIMESTAMP(3),
    "autoReleaseAt" TIMESTAMP(3),
    "deliveryProofUrl" TEXT,
    "deliveryNotes" TEXT,
    "fraudScore" INTEGER,
    "fraudFlags" JSONB,
    "hasMilestones" BOOLEAN NOT NULL DEFAULT false,
    "totalMilestones" INTEGER NOT NULL DEFAULT 0,
    "completedMilestones" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "milestoneNumber" INTEGER NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "state" "MilestoneState" NOT NULL DEFAULT 'pending',
    "deadline" TIMESTAMP(3),
    "proofUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT,
    "buyerEvidence" JSONB,
    "sellerEvidence" JSONB,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "resolutionAction" "ResolutionAction",
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "responseDeadline" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "messageEn" TEXT,
    "messageSw" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "transactionId" TEXT,
    "signalType" "SignalType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "scoreImpact" INTEGER NOT NULL,
    "details" JSONB,
    "actionTaken" "SignalAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "amount" DECIMAL(10,2),
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "metadata" JSONB,
    "transactionId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimerJob" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "jobType" "TimerJobType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "firedAt" TIMESTAMP(3),
    "status" "TimerJobStatus" NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_referenceNo_key" ON "Transaction"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerJob" ADD CONSTRAINT "TimerJob_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
