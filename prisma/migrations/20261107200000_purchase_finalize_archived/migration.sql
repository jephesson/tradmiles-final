-- AlterTable
ALTER TABLE "purchases" ADD COLUMN "finalizeArchived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: compras arquivadas pelo botão "sem impacto"
UPDATE "purchases"
SET "finalizeArchived" = true
WHERE "finalizedAt" IS NOT NULL
  AND "observacao" LIKE '%ARQUIVADA (sem impacto)%';
