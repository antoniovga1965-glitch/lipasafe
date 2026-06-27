-- Baseline: enum variants already exist in DB, added via db push
-- Marking as applied so Prisma migration history matches DB state

ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'read';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'money_sent';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'money_received';
ALTER TYPE "TimerJobType" ADD VALUE IF NOT EXISTS 'dispute_seller_timeout';
ALTER TYPE "TimerJobType" ADD VALUE IF NOT EXISTS 'dispute_admin_timeout';
