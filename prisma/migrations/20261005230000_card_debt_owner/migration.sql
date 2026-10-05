-- AlterTable
ALTER TABLE "card_debt_creditors" ADD COLUMN "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "card_debt_creditors_ownerId_idx" ON "card_debt_creditors"("ownerId");

-- AddForeignKey
ALTER TABLE "card_debt_creditors" ADD CONSTRAINT "card_debt_creditors_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
