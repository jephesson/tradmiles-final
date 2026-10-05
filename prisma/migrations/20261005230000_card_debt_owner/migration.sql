-- AlterTable
ALTER TABLE "card_debt_creditors" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "card_debt_creditors_ownerId_idx" ON "card_debt_creditors"("ownerId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "card_debt_creditors" ADD CONSTRAINT "card_debt_creditors_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
