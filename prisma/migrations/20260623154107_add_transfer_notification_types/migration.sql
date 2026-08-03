ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'transfer_incoming';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'transfer_sent';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'transfer_accepted';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'transfer_declined';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'transfer_cancelled';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'transfer_expired';
