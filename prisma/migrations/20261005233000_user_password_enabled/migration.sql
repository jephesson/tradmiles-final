-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordEnabled" BOOLEAN NOT NULL DEFAULT true;
