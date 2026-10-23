-- CreateEnum
CREATE TYPE "FilaAssinaturaResultado" AS ENUM ('CONCLUIDO', 'NEGADO', 'SEM_RESPOSTA');

-- AlterTable
ALTER TABLE "fila_assinaturas" ADD COLUMN     "resultado" "FilaAssinaturaResultado";

