-- CreateTable
CREATE TABLE "StkPushLog" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StkPushLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StkPushLog_checkoutId_key" ON "StkPushLog"("checkoutId");
