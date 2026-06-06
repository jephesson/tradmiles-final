-- Rateio C3 gravado na finalização (fonte de verdade para comissões)
ALTER TABLE "purchases" ADD COLUMN "finalRateioBreakdown" JSONB;
