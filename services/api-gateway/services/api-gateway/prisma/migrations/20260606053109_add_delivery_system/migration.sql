-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING_PHOTO_UPLOAD', 'PHOTO_WAITING_BUYER_CONFIRMATION', 'PHOTO_CONFIRMED_BY_BUYER', 'PICKUP_OTP_ISSUED', 'IN_TRANSIT', 'DELIVERY_PHOTO_UPLOADED', 'AWAITING_RECEIPT', 'RECEIPT_OTP_ISSUED', 'AWAITING_RELEASE_WINDOW', 'PAYMENT_PROCESSING', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'PAYMENT_FAILED', 'DELIVERY_TIMEOUT');

-- CreateEnum
CREATE TYPE "DeliveryPhotoType" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateEnum
CREATE TYPE "DeliveryOTPType" AS ENUM ('PICKUP_OTP', 'DELIVERY_OTP');

-- CreateEnum
CREATE TYPE "DeliveryActorType" AS ENUM ('buyer', 'deliveryGuy', 'system', 'admin');

-- CreateEnum
CREATE TYPE "DeliveryDisputeStatus" AS ENUM ('OPEN', 'PENDING_ADMIN', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DeliveryRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "deliveryGuyPhone" TEXT NOT NULL,
    "deliveryGuyName" TEXT,
    "amount" INTEGER NOT NULL,
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
    "paymentRef" TEXT,
    "paymentAttempts" INTEGER NOT NULL DEFAULT 0,
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
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "deviceId" TEXT NOT NULL,
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
    "enteredBy" "DeliveryActorType" NOT NULL,
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
CREATE UNIQUE INDEX "DeliveryPhoto_orderId_photoType_key" ON "DeliveryPhoto"("orderId", "photoType");

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
