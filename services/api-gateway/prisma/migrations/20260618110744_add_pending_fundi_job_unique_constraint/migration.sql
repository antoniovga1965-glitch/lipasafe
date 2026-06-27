-- Partial unique index: one PENDING_PAYMENT job per buyer+fundi at a time.
-- schema.prisma can't express conditional unique constraints, so this is raw SQL.
CREATE UNIQUE INDEX "FundiJob_buyerId_fundiPhone_pending_unique"
ON "FundiJob" ("buyerId", "fundiPhone")
WHERE "status" = 'PENDING_PAYMENT';
