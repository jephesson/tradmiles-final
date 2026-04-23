-- AlterTable
ALTER TABLE "affiliates" ADD COLUMN "pixKey" TEXT;
ALTER TABLE "affiliates" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "affiliates" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Existing active affiliates were already approved before this workflow existed.
UPDATE "affiliates"
SET "approvedAt" = COALESCE("approvedAt", "createdAt")
WHERE "isActive" = true AND "approvedAt" IS NULL;

-- CreateIndex
CREATE INDEX "affiliates_team_status_idx" ON "affiliates"("team", "status");
