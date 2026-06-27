-- CreateIndex
CREATE INDEX "FundiJob_buyerId_fundiPhone_status_idx" ON "FundiJob"("buyerId", "fundiPhone", "status");

-- Prevent duplicate PENDING_PAYMENT jobs for same buyer+fundi
CREATE UNIQUE INDEX IF NOT EXISTS fundi_job_no_duplicate_pending
ON "FundiJob" ("buyerId", "fundiPhone")
WHERE status = 'PENDING_PAYMENT';
