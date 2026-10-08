-- Piso de milheiro por cedente para aparecer na lista de venda (MAX ignora).
ALTER TABLE "cedentes" ADD COLUMN IF NOT EXISTS "minSellMilheiroCents" INTEGER;
CREATE INDEX IF NOT EXISTS "cedentes_minSellMilheiroCents_idx" ON "cedentes"("minSellMilheiroCents");
