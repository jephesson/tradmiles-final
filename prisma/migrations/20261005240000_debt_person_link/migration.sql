-- AlterTable
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "linkedUserId" TEXT;
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT;
ALTER TABLE "debts" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "paidVia" TEXT;
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "sourceKind" TEXT;
ALTER TABLE "debt_payments" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "inter_pix_payments" ADD COLUMN IF NOT EXISTS "debtIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "inter_pix_payments" ADD COLUMN IF NOT EXISTS "personDebtGroupKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "debts_sourceKind_sourceRef_key" ON "debts"("sourceKind", "sourceRef");
CREATE INDEX IF NOT EXISTS "debts_linkedUserId_idx" ON "debts"("linkedUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "debt_payments_sourceKind_sourceRef_key" ON "debt_payments"("sourceKind", "sourceRef");

DO $$ BEGIN
  ALTER TABLE "debts" ADD CONSTRAINT "debts_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
