ALTER TABLE "affiliate_commissions"
ALTER COLUMN "saleId" DROP NOT NULL;

ALTER TABLE "affiliate_commissions"
ADD COLUMN "balcaoOperationId" TEXT;

CREATE UNIQUE INDEX "affiliate_commissions_balcaoOperationId_key"
ON "affiliate_commissions"("balcaoOperationId");

CREATE INDEX "affiliate_commissions_balcaoOperationId_generatedAt_idx"
ON "affiliate_commissions"("balcaoOperationId", "generatedAt");

ALTER TABLE "affiliate_commissions"
ADD CONSTRAINT "affiliate_commissions_balcaoOperationId_fkey"
FOREIGN KEY ("balcaoOperationId") REFERENCES "balcao_operacoes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
