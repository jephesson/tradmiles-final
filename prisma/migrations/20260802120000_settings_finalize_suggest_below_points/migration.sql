-- Após venda: sugerir finalizar compra se restante < limiar (padrão 5000 pts)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "finalizeSuggestBelowPoints" INTEGER NOT NULL DEFAULT 5000;
