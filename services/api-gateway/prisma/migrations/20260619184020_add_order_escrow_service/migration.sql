-- CreateEnum
CREATE TYPE "OrderState" AS ENUM ('HELD', 'RELEASED', 'DISPUTED', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'AUTO_RELEASED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerPhone" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
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

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDispute" ADD CONSTRAINT "OrderDispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkSession" ADD CONSTRAINT "LinkSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
