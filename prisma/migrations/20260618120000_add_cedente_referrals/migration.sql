-- CreateEnum
CREATE TYPE "CedenteReferralStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN "referredByCedenteId" TEXT;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN "cedenteReferralBonusCents" INTEGER NOT NULL DEFAULT 2000;

-- CreateTable
CREATE TABLE "cedente_referrals" (
    "id" TEXT NOT NULL,
    "referrerCedenteId" TEXT NOT NULL,
    "referredCedenteId" TEXT NOT NULL,
    "referrerCode" TEXT NOT NULL,
    "status" "CedenteReferralStatus" NOT NULL DEFAULT 'PENDING',
    "commissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "cedente_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cedente_referrals_referredCedenteId_key" ON "cedente_referrals"("referredCedenteId");

-- CreateIndex
CREATE UNIQUE INDEX "cedente_referrals_commissionId_key" ON "cedente_referrals"("commissionId");

-- CreateIndex
CREATE INDEX "cedente_referrals_referrerCedenteId_createdAt_idx" ON "cedente_referrals"("referrerCedenteId", "createdAt");

-- CreateIndex
CREATE INDEX "cedente_referrals_status_createdAt_idx" ON "cedente_referrals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "cedentes_referredByCedenteId_idx" ON "cedentes"("referredByCedenteId");

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_referredByCedenteId_fkey" FOREIGN KEY ("referredByCedenteId") REFERENCES "cedentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_referrals" ADD CONSTRAINT "cedente_referrals_referrerCedenteId_fkey" FOREIGN KEY ("referrerCedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_referrals" ADD CONSTRAINT "cedente_referrals_referredCedenteId_fkey" FOREIGN KEY ("referredCedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_referrals" ADD CONSTRAINT "cedente_referrals_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "cedente_commissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
