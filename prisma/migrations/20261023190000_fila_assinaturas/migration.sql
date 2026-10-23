-- CreateEnum
CREATE TYPE "AssinaturaStatus" AS ENUM ('AGUARDANDO', 'ASSINADO', 'ERRO');

-- CreateTable
CREATE TABLE "fila_assinaturas" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "latamStatus" "AssinaturaStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "liveloStatus" "AssinaturaStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "note" TEXT,
    "addedById" TEXT NOT NULL,
    "concludedAt" TIMESTAMP(3),
    "concludedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fila_assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fila_assinaturas_team_concludedAt_idx" ON "fila_assinaturas"("team", "concludedAt");

-- CreateIndex
CREATE INDEX "fila_assinaturas_cedenteId_idx" ON "fila_assinaturas"("cedenteId");

-- AddForeignKey
ALTER TABLE "fila_assinaturas" ADD CONSTRAINT "fila_assinaturas_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fila_assinaturas" ADD CONSTRAINT "fila_assinaturas_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

