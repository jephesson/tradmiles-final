-- AlterTable
ALTER TABLE "cotacao_passagem_jobs" ADD COLUMN IF NOT EXISTS "filterMaxDurationMin" INTEGER;
ALTER TABLE "cotacao_passagem_jobs" ADD COLUMN IF NOT EXISTS "filterDepFrom" TEXT;
ALTER TABLE "cotacao_passagem_jobs" ADD COLUMN IF NOT EXISTS "filterDepTo" TEXT;
ALTER TABLE "cotacao_passagem_jobs" ADD COLUMN IF NOT EXISTS "filterDirectOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cotacao_passagem_searches" ADD COLUMN IF NOT EXISTS "depTime" TEXT;
ALTER TABLE "cotacao_passagem_searches" ADD COLUMN IF NOT EXISTS "arrTime" TEXT;
ALTER TABLE "cotacao_passagem_searches" ADD COLUMN IF NOT EXISTS "durationMin" INTEGER;
ALTER TABLE "cotacao_passagem_searches" ADD COLUMN IF NOT EXISTS "stops" INTEGER;
