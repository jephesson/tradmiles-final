-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN "latamCreacaoPendente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cedentes" ADD COLUMN "smilesCreacaoPendente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cedentes" ADD COLUMN "liveloCreacaoPendente" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: sem senha => pendente de criação
UPDATE "cedentes" SET "latamCreacaoPendente" = true WHERE "senhaLatamPass" IS NULL OR TRIM("senhaLatamPass") = '';
UPDATE "cedentes" SET "smilesCreacaoPendente" = true WHERE "senhaSmiles" IS NULL OR TRIM("senhaSmiles") = '';
UPDATE "cedentes" SET "liveloCreacaoPendente" = true WHERE "senhaLivelo" IS NULL OR TRIM("senhaLivelo") = '';
