-- Reconciliation migration: AuditLog.actorId FK was dropped directly via
-- manual psql ALTER TABLE rather than through a tracked migration. This
-- migration documents that change. It is marked applied (not executed)
-- via `prisma migrate resolve --applied`, since the DB is already in
-- this state.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorId_fkey";
