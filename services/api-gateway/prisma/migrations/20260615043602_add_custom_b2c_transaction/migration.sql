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

-- CreateIndex
CREATE UNIQUE INDEX "CustomB2CTransaction_originatorConversationId_key" ON "CustomB2CTransaction"("originatorConversationId");

-- CreateIndex
CREATE INDEX "CustomB2CTransaction_escrowId_idx" ON "CustomB2CTransaction"("escrowId");

-- CreateIndex
CREATE INDEX "CustomB2CTransaction_status_idx" ON "CustomB2CTransaction"("status");

-- CreateIndex
CREATE INDEX "CustomB2CTransaction_originatorConversationId_idx" ON "CustomB2CTransaction"("originatorConversationId");

-- AddForeignKey
ALTER TABLE "CustomB2CTransaction" ADD CONSTRAINT "CustomB2CTransaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "CustomEscrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
