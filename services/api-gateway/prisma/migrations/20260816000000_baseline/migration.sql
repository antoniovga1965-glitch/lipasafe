-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('buyer', 'seller', 'both', 'admin');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'frozen', 'banned');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('bundles', 'second_hand', 'delivery', 'fundi', 'house_agent', 'freelancer', 'goods_seller', 'other');

-- CreateEnum
CREATE TYPE "TransactionState" AS ENUM ('initiated', 'payment_pending', 'held', 'delivered', 'confirmed', 'disputed', 'resolved', 'released', 'refunded', 'expired', 'cancelled', 'releasing', 'payout_pending');

-- CreateEnum
CREATE TYPE "MilestoneState" AS ENUM ('pending', 'delivered', 'confirmed', 'released', 'disputed');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('not_as_described', 'fake_or_clone', 'not_delivered', 'wrong_item', 'damaged_goods', 'service_incomplete', 'fraud_suspected', 'other');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'resolved_partial', 'escalated');

-- CreateEnum
CREATE TYPE "ResolutionAction" AS ENUM ('full_refund', 'full_release', 'partial_refund', 'partial_release');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('money_sent', 'money_received', 'payment_received', 'deliver_now', 'confirm_delivery', 'money_released', 'refund_sent', 'dispute_opened', 'dispute_resolved', 'auto_release_warning', 'account_frozen', 'house_payment_held', 'house_deal_accepted', 'house_deal_rejected', 'bundle_otp', 'otp_handover', 'auto_otp', 'inspection_expired', 'auto_release', 'transfer_received', 'transfer_failed', 'transfer_sent', 'transfer_accepted', 'transfer_declined', 'transfer_cancelled', 'transfer_expired', 'money_request_received', 'money_request_paid', 'money_request_rejected', 'money_request_cancelled', 'money_request_expired', 'dispute_response', 'REQUEST_REJECTED', 'NEW_DELIVERY_ORDER', 'BEFORE_PHOTO_UPLOADED', 'BEFORE_PHOTO_REJECTED', 'PICKUP_OTP_ISSUED', 'DELIVERY_STARTED', 'RECEIPT_OTP_ISSUED', 'PAYMENT_RELEASED', 'CUSTOM_DEAL_RECEIVED', 'CUSTOM_DEAL_ACCEPTED', 'CUSTOM_DEAL_REJECTED', 'CUSTOM_BUYER_CONFIRMED', 'CUSTOM_PAYMENT_RELEASED', 'FUNDI_JOB_CREATED', 'FUNDI_OTP_ISSUED', 'FUNDI_JOB_ACCEPTED', 'FUNDI_JOB_COMPLETED', 'FUNDI_EXTENSION_REQUESTED', 'FUNDI_EXTENSION_APPROVED', 'dispute_resolved_refund', 'dispute_resolved_release');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'push', 'whatsapp');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('read', 'pending', 'sent', 'failed', 'delivered');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('velocity_breach', 'same_device_buyer_seller', 'same_ip_buyer_seller', 'new_account_large_amount', 'high_dispute_rate', 'sim_swap_detected', 'bot_behavior', 'pattern_anomaly', 'amount_structuring');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "SignalAction" AS ENUM ('logged', 'flagged', 'blocked', 'frozen');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'admin', 'system');

-- CreateEnum
CREATE TYPE "TimerJobType" AS ENUM ('delivery_reminder', 'auto_release', 'dispute_deadline', 'dispute_seller_timeout', 'dispute_admin_timeout', 'payment_expiry', 'confirmation_reminder', 'seller_delivery_deadline', 'inspection_deadline', 'handover_timeout', 'otp_entry_timeout', 'buyer_decision_deadline', 'auto_otp');

-- CreateEnum
CREATE TYPE "TimerJobStatus" AS ENUM ('pending', 'fired', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('send', 'receive', 'top_up', 'withdrawal', 'escrow_lock', 'escrow_release', 'refund', 'recall', 'platform_fee');

-- CreateEnum
CREATE TYPE "WalletTxStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed', 'recalled', 'disputed');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('new', 'like_new', 'refurbished', 'good', 'fair', 'faulty');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('active', 'locked', 'sold', 'cancelled');

-- CreateEnum
CREATE TYPE "FundiJobStatus" AS ENUM ('PENDING_PAYMENT', 'WAITING_FOR_FUNDI_ACCEPTANCE', 'ACTIVE', 'AWAITING_BUYER_REVIEW', 'OVERDUE', 'AWAITING_PAYOUT', 'COMPLETED', 'REFUNDED', 'PAYOUT_FAILED', 'EXPIRED', 'CANCELLED', 'DISPUTED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FundiDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "FundiDisputeResult" AS ENUM ('FULL_REFUND', 'FULL_RELEASE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING_PAYMENT', 'PENDING_PHOTO_UPLOAD', 'PHOTO_WAITING_BUYER_CONFIRMATION', 'PHOTO_CONFIRMED_BY_BUYER', 'PICKUP_ISSUED', 'IN_TRANSIT', 'DELIVERY_PHOTO_UPLOADED', 'AWAITING_RECEIPT', 'RECEIPT_OTP_ISSUED', 'AWAITING_RELEASE_WINDOW', 'PAYMENT_PROCESSING', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'PAYMENT_FAILED', 'DELIVERY_TIMEOUT', 'DELIVERY_OVERDUE', 'AUTO_REFUNDED');

-- CreateEnum
CREATE TYPE "DeliveryPhotoType" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateEnum
CREATE TYPE "DeliveryOTPType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "DeliveryActorType" AS ENUM ('BUYER', 'DELIVERY_GUY', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "DeliveryDisputeStatus" AS ENUM ('OPEN', 'PENDING_ADMIN', 'AUTO_RESOLVED', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DeliveryRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "HouseEscrowStatus" AS ENUM ('PENDING_ACCEPTANCE', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'PENDING_PAYMENT', 'PAYMENT_INITIATING', 'PAYMENT_HELD', 'CONFIRMED', 'DISPUTED', 'ESCALATED', 'REFUNDED', 'COMPLETED', 'AUTO_RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HouseDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "HouseDisputeResult" AS ENUM ('FULL_REFUND', 'FULL_RELEASE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "CustomEscrowStatus" AS ENUM ('PENDING_ACCEPTANCE', 'REJECTED', 'ACCEPTED', 'PENDING_PAYMENT', 'PAYMENT_INITIATING', 'PAYMENT_HELD', 'BUYER_CONFIRMED', 'COMPLETED', 'DISPUTED', 'PAYMENT_MISMATCH', 'RELEASING_FUNDS', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('HELD', 'RELEASED', 'DISPUTED', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'AUTO_RELEASED');

-- CreateEnum
CREATE TYPE "TransferPurpose" AS ENUM ('RENT', 'PURCHASE', 'SALARY', 'SCHOOL_FEES', 'LOAN', 'GIFT', 'OTHER');

-- CreateEnum
CREATE TYPE "ProtectedTransferState" AS ENUM ('PENDING', 'RELEASING', 'REFUNDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequestPurpose" AS ENUM ('RENT', 'SALARY', 'SCHOOL_FEES', 'PURCHASE', 'LOAN', 'GIFT', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('PENDING', 'PAID', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExtensionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'unverified',
    "kycTier" TEXT NOT NULL DEFAULT 'basic',
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
    "email" TEXT NOT NULL,
    "pushToken" TEXT,
    "avatarUrl" TEXT,

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
    "status" TEXT NOT NULL DEFAULT 'active',
    "verifiedAt" TIMESTAMP(3),
    "idBackUrl" TEXT,
    "selfieUrl" TEXT,
    "kycSubmittedAt" TIMESTAMP(3),
    "kycRejectionReason" TEXT,
    "contactNumber" TEXT,
    "trustedSeller" BOOLEAN NOT NULL DEFAULT false,
    "trustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checkoutRequestId" TEXT,
    "merchantRequestId" TEXT,
    "mpesaRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycPayment_pkey" PRIMARY KEY ("id")
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
    "claimedAt" TIMESTAMP(3),
    "isGhost" BOOLEAN NOT NULL DEFAULT false,
    "recallAt" TIMESTAMP(3),
    "recallStartedAt" TIMESTAMP(3),
    "recallCompletedAt" TIMESTAMP(3),
    "dailySendDate" TIMESTAMP(3),
    "dailySendTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
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
    "transferId" TEXT,
    "houseEscrowId" TEXT,
    "orderId" TEXT,
    "requestId" TEXT,
    "deliveryOrderId" TEXT,
    "customEscrowId" TEXT,
    "fundiJobId" TEXT,
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

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "fromWalletId" TEXT,
    "toWalletId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientRef" TEXT,
    "status" "WalletTxStatus" NOT NULL DEFAULT 'completed',
    "fee" DECIMAL(12,2),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpesaTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesaRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callbackPhone" TEXT,
    "idempotencyKey" TEXT,
    "merchantRequestId" TEXT,
    "processedAt" TIMESTAMP(3),
    "resultDesc" TEXT,
    "fee" DECIMAL(10,2),

    CONSTRAINT "MpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "fee" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "payoutType" TEXT NOT NULL DEFAULT 'full',
    "amount" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "payoutChannel" TEXT,
    "payoutDestination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "originatorConversationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "mpesaRef" TEXT,
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecondHandListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "condition" "ItemCondition" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "images" TEXT[],
    "conditionPhotos" TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'active',
    "lockedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecondHandListing_pkey" PRIMARY KEY ("id")
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
    "b2bOriginatorId" TEXT,
    "b2cOriginatorId" TEXT,
    "mpesaRef" TEXT,
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
    "payoutInitiatedAt" TIMESTAMP(3),
    "notifyPhone" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpVerifiedAt" TIMESTAMP(3),
    "smsDeliveryStatus" TEXT,
    "deletedByBuyer" BOOLEAN NOT NULL DEFAULT false,
    "deletedBySeller" BOOLEAN NOT NULL DEFAULT false,
    "listingId" TEXT,
    "inspectionHours" INTEGER,
    "sellerPhone" TEXT,
    "inspectionDeadline" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundiJob" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "fundiPhone" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "serviceFee" DECIMAL(10,2) NOT NULL,
    "totalCharged" DECIMAL(10,2) NOT NULL,
    "b2cCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "category" TEXT,
    "deliverables" TEXT[],
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "extensionRequestStatus" "ExtensionRequestStatus",
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
    "originatorConversationId" TEXT,
    "payoutInitiatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundiPayout" (
    "id" TEXT NOT NULL,
    "fundiJobId" TEXT NOT NULL,
    "payoutType" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "originatorConversationId" TEXT NOT NULL,
    "mpesaRef" TEXT,
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundiPayout_pkey" PRIMARY KEY ("id")
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
    "purpose" "TransferPurpose" NOT NULL DEFAULT 'OTHER',
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

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "deliveryGuyPhone" TEXT NOT NULL,
    "deliveryGuyName" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "goods" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "setDeliveryTime" TIMESTAMP(3) NOT NULL,
    "originalDeliveryTime" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "pickupOtpEnteredAt" TIMESTAMP(3),
    "deliveryStartedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING_PHOTO_UPLOAD',
    "mpesaCheckoutId" TEXT,
    "mpesaRef" TEXT,
    "productDescription" TEXT,
    "paymentRef" TEXT,
    "paymentAttempts" INTEGER NOT NULL DEFAULT 0,
    "b2cOriginatorId" TEXT,
    "lastPaymentAttempt" TIMESTAMP(3),
    "paymentFailureReason" TEXT,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "totalExtendedMinutes" INTEGER NOT NULL DEFAULT 0,
    "hasDispute" BOOLEAN NOT NULL DEFAULT false,
    "disputeOpenedAt" TIMESTAMP(3),
    "disputeResolution" TEXT,
    "adminNotesOnDispute" TEXT,
    "deliveryGuyRiskScore" INTEGER NOT NULL DEFAULT 0,
    "requiresAfterPhoto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "photoType" "DeliveryPhotoType" NOT NULL,
    "cloudinaryUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT NOT NULL,
    "uploadedBy" "DeliveryActorType" NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deviceId" TEXT,
    "photoIndex" INTEGER NOT NULL DEFAULT 0,
    "buyerConfirmedAt" TIMESTAMP(3),
    "comparisonScore" DOUBLE PRECISION,
    "fraudRiskScore" DOUBLE PRECISION,
    "flaggedIssues" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOTP" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "otpType" "DeliveryOTPType" NOT NULL,
    "otp" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "enteredAt" TIMESTAMP(3),
    "enteredBy" "DeliveryActorType",
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryOTP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryTimeline" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actor" "DeliveryActorType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryDispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "claimerType" "DeliveryActorType" NOT NULL,
    "reason" TEXT NOT NULL,
    "claimDescription" TEXT,
    "cvAnalysisReport" TEXT,
    "evidenceBundle" TEXT,
    "status" "DeliveryDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "adminAssignedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPhotoComparison" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "beforePhotoUrl" TEXT NOT NULL,
    "duringPhotoUrl" TEXT NOT NULL,
    "afterPhotoUrl" TEXT,
    "resembleScore" DOUBLE PRECISION,
    "pHashDistance" INTEGER,
    "orbMatches" INTEGER,
    "clipSimilarity" DOUBLE PRECISION,
    "dinoV2Similarity" DOUBLE PRECISION,
    "tamperedScore" DOUBLE PRECISION,
    "substitutedScore" DOUBLE PRECISION,
    "damageDetected" BOOLEAN,
    "missingItemDetected" BOOLEAN,
    "finalVerdict" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPhotoComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryGuyRiskProfile" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "totalDisputes" INTEGER NOT NULL DEFAULT 0,
    "minorDisputes" INTEGER NOT NULL DEFAULT 0,
    "refundDisputes" INTEGER NOT NULL DEFAULT 0,
    "fraudConfirmed" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" "DeliveryRiskLevel" NOT NULL DEFAULT 'LOW',
    "lastDisputeAt" TIMESTAMP(3),
    "cautiondedAt" TIMESTAMP(3),
    "flaggedForReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryGuyRiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPaymentRetryLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "mpesaResponseCode" TEXT,
    "mpesaResponseDesc" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPaymentRetryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvidenceBundle" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "beforePhoto" TEXT NOT NULL,
    "duringPhoto" TEXT NOT NULL,
    "afterPhoto" TEXT,
    "photoComparison" TEXT NOT NULL,
    "cvAnalysisReport" TEXT NOT NULL,
    "timeline" TEXT NOT NULL,
    "gpsData" TEXT NOT NULL,
    "otpLogs" TEXT NOT NULL,
    "smsSentLogs" TEXT NOT NULL,
    "paymentLogs" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvidenceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRating" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMpesaTransaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "totalCharged" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesaRef" TEXT,
    "resultDesc" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryMpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEscrow" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "heldAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMpesaCallback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryMpesaCallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseEscrow" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "description" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL DEFAULT 'general',
    "address" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2),
    "sellerReceives" DECIMAL(10,2),
    "status" "HouseEscrowStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "acceptanceDeadline" TIMESTAMP(3),
    "mpesaCheckoutId" TEXT,
    "mpesaRef" TEXT,
    "idempotencyKey" TEXT,
    "inspectionHours" INTEGER NOT NULL DEFAULT 24,
    "inspectionDeadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "autoReleasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseDispute" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "purpose" "TransferPurpose" NOT NULL DEFAULT 'OTHER',
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
    "fee" DECIMAL(10,2),
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
    "b2cCost" DECIMAL(12,2),
    "buyerTotal" DECIMAL(12,2),
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
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
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
    "sellerResponse" TEXT,
    "sellerEvidence" TEXT[],
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
CREATE TABLE "CustomB2CTransaction" (
    "id" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originatorConversationId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mpesaRef" TEXT,
    "resultCode" TEXT,
    "resultDesc" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomB2CTransaction_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2),
    "sellerReceives" DECIMAL(10,2),
    "buyerTotal" DECIMAL(10,2),
    "timerMinutes" INTEGER NOT NULL,
    "state" "OrderState" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3),
    "linkOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "buyerNote" TEXT,
    "sellerEvidenceUrl" TEXT,
    "sellerNote" TEXT,
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OrderDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkSession" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ip" TEXT,
    "deviceFingerprint" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionTaken" TEXT,

    CONSTRAINT "LinkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectedTransfer" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "b2cCharge" DECIMAL(10,2) NOT NULL,
    "purpose" "TransferPurpose" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "state" "ProtectedTransferState" NOT NULL DEFAULT 'PENDING',
    "mpesaRef" TEXT,
    "b2cRef" TEXT,
    "stkCheckoutId" TEXT,
    "claimCode" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "deletedBySender" BOOLEAN NOT NULL DEFAULT false,
    "deletedByRecipient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtectedTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMoney" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "recipientId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "b2cCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "recipientPays" DECIMAL(12,2) NOT NULL,
    "purpose" "RequestPurpose" NOT NULL,
    "note" TEXT,
    "state" "RequestState" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "checkoutRequestId" TEXT,
    "mpesaRef" TEXT,
    "b2cRef" TEXT,
    "b2cStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestMoney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StkPushLog" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StkPushLog_pkey" PRIMARY KEY ("id")
);

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

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KycPayment_checkoutRequestId_key" ON "KycPayment"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "KycPayment_idempotencyKey_key" ON "KycPayment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_status_idx" ON "Notification"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimerJob_transactionId_jobType_key" ON "TimerJob"("transactionId", "jobType");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_clientRef_key" ON "WalletTransaction"("clientRef");

-- CreateIndex
CREATE INDEX "WalletTransaction_fromWalletId_createdAt_idx" ON "WalletTransaction"("fromWalletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_checkoutRequestId_key" ON "MpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_mpesaRef_key" ON "MpesaTransaction"("mpesaRef");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_idempotencyKey_key" ON "MpesaTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MpesaTransaction_userId_idx" ON "MpesaTransaction"("userId");

-- CreateIndex
CREATE INDEX "MpesaTransaction_status_idx" ON "MpesaTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_reference_key" ON "PaymentRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_originatorConversationId_key" ON "Payout"("originatorConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_transactionId_payoutType_key" ON "Payout"("transactionId", "payoutType");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_referenceNo_key" ON "Transaction"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Transaction_buyerId_idx" ON "Transaction"("buyerId");

-- CreateIndex
CREATE INDEX "Transaction_sellerId_idx" ON "Transaction"("sellerId");

-- CreateIndex
CREATE INDEX "Transaction_state_idx" ON "Transaction"("state");

-- CreateIndex
CREATE INDEX "Transaction_buyerId_state_idx" ON "Transaction"("buyerId", "state");

-- CreateIndex
CREATE INDEX "Transaction_sellerId_state_idx" ON "Transaction"("sellerId", "state");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FundiJob_mpesaCheckoutId_key" ON "FundiJob"("mpesaCheckoutId");

-- CreateIndex
CREATE INDEX "FundiJob_buyerId_fundiPhone_status_idx" ON "FundiJob"("buyerId", "fundiPhone", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FundiPayout_originatorConversationId_key" ON "FundiPayout"("originatorConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiPayout_fundiJobId_payoutType_key" ON "FundiPayout"("fundiJobId", "payoutType");

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

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_mpesaCheckoutId_key" ON "DeliveryOrder"("mpesaCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_mpesaRef_key" ON "DeliveryOrder"("mpesaRef");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_paymentRef_key" ON "DeliveryOrder"("paymentRef");

-- CreateIndex
CREATE INDEX "DeliveryOrder_buyerId_idx" ON "DeliveryOrder"("buyerId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_deliveryGuyPhone_idx" ON "DeliveryOrder"("deliveryGuyPhone");

-- CreateIndex
CREATE INDEX "DeliveryOrder_status_idx" ON "DeliveryOrder"("status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_createdAt_idx" ON "DeliveryOrder"("createdAt");

-- CreateIndex
CREATE INDEX "DeliveryOrder_setDeliveryTime_idx" ON "DeliveryOrder"("setDeliveryTime");

-- CreateIndex
CREATE INDEX "DeliveryPhoto_orderId_idx" ON "DeliveryPhoto"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryPhoto_photoType_idx" ON "DeliveryPhoto"("photoType");

-- CreateIndex
CREATE INDEX "DeliveryPhoto_uploadedBy_idx" ON "DeliveryPhoto"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPhoto_orderId_photoType_photoIndex_key" ON "DeliveryPhoto"("orderId", "photoType", "photoIndex");

-- CreateIndex
CREATE INDEX "DeliveryOTP_orderId_idx" ON "DeliveryOTP"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryOTP_otpType_idx" ON "DeliveryOTP"("otpType");

-- CreateIndex
CREATE INDEX "DeliveryOTP_expiresAt_idx" ON "DeliveryOTP"("expiresAt");

-- CreateIndex
CREATE INDEX "DeliveryTimeline_orderId_idx" ON "DeliveryTimeline"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryTimeline_timestamp_idx" ON "DeliveryTimeline"("timestamp");

-- CreateIndex
CREATE INDEX "DeliveryTimeline_event_idx" ON "DeliveryTimeline"("event");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryDispute_orderId_key" ON "DeliveryDispute"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryDispute_status_idx" ON "DeliveryDispute"("status");

-- CreateIndex
CREATE INDEX "DeliveryDispute_claimerType_idx" ON "DeliveryDispute"("claimerType");

-- CreateIndex
CREATE INDEX "DeliveryDispute_createdAt_idx" ON "DeliveryDispute"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPhotoComparison_disputeId_key" ON "DeliveryPhotoComparison"("disputeId");

-- CreateIndex
CREATE INDEX "DeliveryPhotoComparison_disputeId_idx" ON "DeliveryPhotoComparison"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryGuyRiskProfile_phone_key" ON "DeliveryGuyRiskProfile"("phone");

-- CreateIndex
CREATE INDEX "DeliveryGuyRiskProfile_riskScore_idx" ON "DeliveryGuyRiskProfile"("riskScore");

-- CreateIndex
CREATE INDEX "DeliveryGuyRiskProfile_riskLevel_idx" ON "DeliveryGuyRiskProfile"("riskLevel");

-- CreateIndex
CREATE INDEX "DeliveryGuyRiskProfile_phone_idx" ON "DeliveryGuyRiskProfile"("phone");

-- CreateIndex
CREATE INDEX "DeliveryPaymentRetryLog_orderId_idx" ON "DeliveryPaymentRetryLog"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryPaymentRetryLog_createdAt_idx" ON "DeliveryPaymentRetryLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEvidenceBundle_disputeId_key" ON "DeliveryEvidenceBundle"("disputeId");

-- CreateIndex
CREATE INDEX "DeliveryEvidenceBundle_disputeId_idx" ON "DeliveryEvidenceBundle"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRating_orderId_key" ON "DeliveryRating"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMpesaTransaction_orderId_key" ON "DeliveryMpesaTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMpesaTransaction_checkoutRequestId_key" ON "DeliveryMpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryMpesaTransaction_mpesaRef_key" ON "DeliveryMpesaTransaction"("mpesaRef");

-- CreateIndex
CREATE INDEX "DeliveryMpesaTransaction_orderId_idx" ON "DeliveryMpesaTransaction"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryMpesaTransaction_status_idx" ON "DeliveryMpesaTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryEscrow_orderId_key" ON "DeliveryEscrow"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryEscrow_orderId_idx" ON "DeliveryEscrow"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryEscrow_status_idx" ON "DeliveryEscrow"("status");

-- CreateIndex
CREATE INDEX "DeliveryMpesaCallback_orderId_idx" ON "DeliveryMpesaCallback"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryMpesaCallback_type_idx" ON "DeliveryMpesaCallback"("type");

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
CREATE INDEX "HouseEscrow_acceptanceDeadline_idx" ON "HouseEscrow"("acceptanceDeadline");

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

-- CreateIndex
CREATE UNIQUE INDEX "CustomEscrow_mpesaCheckoutId_key" ON "CustomEscrow"("mpesaCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomMpesaTransaction_checkoutRequestId_key" ON "CustomMpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomMpesaTransaction_idempotencyKey_key" ON "CustomMpesaTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDispute_escrowId_key" ON "CustomDispute"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomB2CTransaction_originatorConversationId_key" ON "CustomB2CTransaction"("originatorConversationId");

-- CreateIndex
CREATE INDEX "CustomB2CTransaction_escrowId_idx" ON "CustomB2CTransaction"("escrowId");

-- CreateIndex
CREATE INDEX "CustomB2CTransaction_status_idx" ON "CustomB2CTransaction"("status");

-- CreateIndex
CREATE INDEX "CustomB2CTransaction_originatorConversationId_idx" ON "CustomB2CTransaction"("originatorConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_state_idx" ON "Order"("state");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_reference_idx" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDispute_orderId_key" ON "OrderDispute"("orderId");

-- CreateIndex
CREATE INDEX "LinkSession_orderId_idx" ON "LinkSession"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtectedTransfer_stkCheckoutId_key" ON "ProtectedTransfer"("stkCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtectedTransfer_claimCode_key" ON "ProtectedTransfer"("claimCode");

-- CreateIndex
CREATE UNIQUE INDEX "RequestMoney_checkoutRequestId_key" ON "RequestMoney"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "RequestMoney_requesterId_idx" ON "RequestMoney"("requesterId");

-- CreateIndex
CREATE INDEX "RequestMoney_recipientPhone_idx" ON "RequestMoney"("recipientPhone");

-- CreateIndex
CREATE INDEX "RequestMoney_state_idx" ON "RequestMoney"("state");

-- CreateIndex
CREATE UNIQUE INDEX "StkPushLog_checkoutId_key" ON "StkPushLog"("checkoutId");

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycPayment" ADD CONSTRAINT "KycPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_houseEscrowId_fkey" FOREIGN KEY ("houseEscrowId") REFERENCES "HouseEscrow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_fundiJobId_fkey" FOREIGN KEY ("fundiJobId") REFERENCES "FundiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudSignal" ADD CONSTRAINT "FraudSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimerJob" ADD CONSTRAINT "TimerJob_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecondHandListing" ADD CONSTRAINT "SecondHandListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "SecondHandListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiJob" ADD CONSTRAINT "FundiJob_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiPayout" ADD CONSTRAINT "FundiPayout_fundiJobId_fkey" FOREIGN KEY ("fundiJobId") REFERENCES "FundiJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiEscrow" ADD CONSTRAINT "FundiEscrow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiDispute" ADD CONSTRAINT "FundiDispute_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiDispute" ADD CONSTRAINT "FundiDispute_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiSmsReply" ADD CONSTRAINT "FundiSmsReply_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiAuditLog" ADD CONSTRAINT "FundiAuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiAuditLog" ADD CONSTRAINT "FundiAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPhoto" ADD CONSTRAINT "DeliveryPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOTP" ADD CONSTRAINT "DeliveryOTP_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryTimeline" ADD CONSTRAINT "DeliveryTimeline_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryDispute" ADD CONSTRAINT "DeliveryDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPhotoComparison" ADD CONSTRAINT "DeliveryPhotoComparison_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "DeliveryDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRating" ADD CONSTRAINT "DeliveryRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryMpesaTransaction" ADD CONSTRAINT "DeliveryMpesaTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEscrow" ADD CONSTRAINT "DeliveryEscrow_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseEscrow" ADD CONSTRAINT "HouseEscrow_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseDispute" ADD CONSTRAINT "HouseDispute_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "HouseEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseMpesaTransaction" ADD CONSTRAINT "HouseMpesaTransaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "HouseEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseAuditLog" ADD CONSTRAINT "HouseAuditLog_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "HouseEscrow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEscrow" ADD CONSTRAINT "CustomEscrow_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMpesaTransaction" ADD CONSTRAINT "CustomMpesaTransaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDispute" ADD CONSTRAINT "CustomDispute_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomB2CTransaction" ADD CONSTRAINT "CustomB2CTransaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAuditLog" ADD CONSTRAINT "CustomAuditLog_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDispute" ADD CONSTRAINT "OrderDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtectedTransfer" ADD CONSTRAINT "ProtectedTransfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtectedTransfer" ADD CONSTRAINT "ProtectedTransfer_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMoney" ADD CONSTRAINT "RequestMoney_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMoney" ADD CONSTRAINT "RequestMoney_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundiExtensionRequest" ADD CONSTRAINT "FundiExtensionRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "FundiJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

