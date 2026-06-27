-- Remove the duplicate index created today (20260618110744). The original
-- protection already existed from 20260605104108_fundi_no_duplicate_pending
-- and was missed because it's a partial index, invisible in schema.prisma.
DROP INDEX "FundiJob_buyerId_fundiPhone_pending_unique";
