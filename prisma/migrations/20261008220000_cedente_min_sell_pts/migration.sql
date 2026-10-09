-- Piso passa a ser média de pontos por CPF, não milheiro em reais.
ALTER TABLE "cedentes" ADD COLUMN IF NOT EXISTS "minSellPtsPerPax" INTEGER;
CREATE INDEX IF NOT EXISTS "cedentes_minSellPtsPerPax_idx" ON "cedentes"("minSellPtsPerPax");

DROP INDEX IF EXISTS "cedentes_minSellMilheiroCents_idx";
ALTER TABLE "cedentes" DROP COLUMN IF EXISTS "minSellMilheiroCents";
