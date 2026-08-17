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

-- CreateIndex
CREATE UNIQUE INDEX "FundiPayout_originatorConversationId_key" ON "FundiPayout"("originatorConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "FundiPayout_fundiJobId_payoutType_key" ON "FundiPayout"("fundiJobId", "payoutType");

-- AddForeignKey
ALTER TABLE "FundiPayout" ADD CONSTRAINT "FundiPayout_fundiJobId_fkey" FOREIGN KEY ("fundiJobId") REFERENCES "FundiJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
