CREATE TYPE "AffiliateCommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

CREATE TABLE "affiliate_commissions" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "commissionBps" INTEGER NOT NULL DEFAULT 0,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "profitCents" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "status" "AffiliateCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "affiliate_commissions_saleId_key" ON "affiliate_commissions"("saleId");
CREATE INDEX "affiliate_commissions_affiliateId_status_generatedAt_idx" ON "affiliate_commissions"("affiliateId", "status", "generatedAt");
CREATE INDEX "affiliate_commissions_clienteId_generatedAt_idx" ON "affiliate_commissions"("clienteId", "generatedAt");
CREATE INDEX "affiliate_commissions_purchaseId_generatedAt_idx" ON "affiliate_commissions"("purchaseId", "generatedAt");
CREATE INDEX "affiliate_commissions_paidAt_idx" ON "affiliate_commissions"("paidAt");

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_affiliateId_fkey"
FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_clienteId_fkey"
FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_purchaseId_fkey"
FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_generatedById_fkey"
FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_paidById_fkey"
FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
