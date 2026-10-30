ALTER TABLE "cedente_commissions" ADD COLUMN IF NOT EXISTS "employeeShareCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cedente_commissions" ADD COLUMN IF NOT EXISTS "splitEmployeeUserId" TEXT;
ALTER TABLE "cedente_commissions" ADD COLUMN IF NOT EXISTS "splitAt" TIMESTAMP(3);
ALTER TABLE "cedente_commissions" ADD COLUMN IF NOT EXISTS "splitById" TEXT;
ALTER TABLE "cedente_commissions" ADD COLUMN IF NOT EXISTS "employeeSharePaidAt" TIMESTAMP(3);
ALTER TABLE "cedente_commissions" ADD COLUMN IF NOT EXISTS "employeeSharePaidById" TEXT;

CREATE INDEX IF NOT EXISTS "cedente_commissions_splitEmployeeUserId_idx" ON "cedente_commissions"("splitEmployeeUserId");

ALTER TABLE "cedente_commissions" DROP CONSTRAINT IF EXISTS "cedente_commissions_splitEmployeeUserId_fkey";
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_splitEmployeeUserId_fkey" FOREIGN KEY ("splitEmployeeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cedente_commissions" DROP CONSTRAINT IF EXISTS "cedente_commissions_splitById_fkey";
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_splitById_fkey" FOREIGN KEY ("splitById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cedente_commissions" DROP CONSTRAINT IF EXISTS "cedente_commissions_employeeSharePaidById_fkey";
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_employeeSharePaidById_fkey" FOREIGN KEY ("employeeSharePaidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
