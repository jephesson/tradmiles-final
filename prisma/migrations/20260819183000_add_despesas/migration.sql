-- CreateEnum
CREATE TYPE "DespesaStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "DespesaCategoria" AS ENUM ('OPERACIONAL', 'ADMINISTRATIVO', 'MARKETING', 'TECNOLOGIA', 'PESSOAL', 'OUTROS');

-- CreateTable
CREATE TABLE "despesas_recorrentes" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "category" "DespesaCategoria" NOT NULL DEFAULT 'OPERACIONAL',
    "dayOfMonth" INTEGER NOT NULL DEFAULT 5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_recorrentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesas" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "category" "DespesaCategoria" NOT NULL DEFAULT 'OPERACIONAL',
    "status" "DespesaStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "recurringId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "despesas_recorrentes_team_active_idx" ON "despesas_recorrentes"("team", "active");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_despesa_team_month_recurring" ON "despesas"("team", "referenceMonth", "recurringId");

-- CreateIndex
CREATE INDEX "despesas_team_referenceMonth_idx" ON "despesas"("team", "referenceMonth");

-- CreateIndex
CREATE INDEX "despesas_team_status_idx" ON "despesas"("team", "status");

-- CreateIndex
CREATE INDEX "despesas_recurringId_idx" ON "despesas"("recurringId");

-- AddForeignKey
ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "despesas_recorrentes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "despesas_recorrentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
