-- AlterTable
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "securityCity" TEXT NOT NULL DEFAULT 'Munique';
