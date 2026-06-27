/*
  Warnings:

  - A unique constraint covering the columns `[transactionId,jobType]` on the table `TimerJob` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "phone" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "Payout_transactionId_key" ON "Payout"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_originatorConversationId_key" ON "Payout"("originatorConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "TimerJob_transactionId_jobType_key" ON "TimerJob"("transactionId", "jobType");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
