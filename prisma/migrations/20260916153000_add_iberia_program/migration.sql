-- Iberia as a first-class loyalty program (same circuit as LATAM/Smiles).
ALTER TYPE "LoyaltyProgram" ADD VALUE IF NOT EXISTS 'IBERIA';

ALTER TABLE "cedentes" ADD COLUMN IF NOT EXISTS "senhaIberia" TEXT;
ALTER TABLE "cedentes" ADD COLUMN IF NOT EXISTS "pontosIberia" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "saldoPrevistoIberia" INTEGER;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "saldoAplicadoIberia" INTEGER;

ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "iberiaRateCents" INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "cotacaoMinMilheiroIberiaCents" INTEGER NOT NULL DEFAULT 0;
