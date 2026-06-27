-- CreateTable
CREATE TABLE "DeliveryMpesaCallback" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryMpesaCallback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryMpesaCallback_orderId_idx" ON "DeliveryMpesaCallback"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryMpesaCallback_type_idx" ON "DeliveryMpesaCallback"("type");
