-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "idBackUrl" TEXT,
ADD COLUMN     "kycRejectionReason" TEXT,
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "selfieUrl" TEXT,
ADD COLUMN     "trustedAt" TIMESTAMP(3),
ADD COLUMN     "trustedSeller" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "kycTier" TEXT NOT NULL DEFAULT 'basic';

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

-- CreateIndex
CREATE UNIQUE INDEX "KycPayment_checkoutRequestId_key" ON "KycPayment"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "KycPayment_idempotencyKey_key" ON "KycPayment"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "KycPayment" ADD CONSTRAINT "KycPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
