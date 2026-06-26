-- CreateEnum
CREATE TYPE "AvisoStatus" AS ENUM ('PENDENTE', 'RESOLVIDO');

-- CreateEnum
CREATE TYPE "AvisoAudience" AS ENUM ('GROUP', 'USER', 'SELF');

-- CreateTable
CREATE TABLE "avisos" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "status" "AvisoStatus" NOT NULL DEFAULT 'PENDENTE',
    "titulo" TEXT,
    "texto" TEXT NOT NULL,
    "dateISO" TEXT NOT NULL,
    "audience" "AvisoAudience" NOT NULL DEFAULT 'GROUP',
    "targetUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_team_status_idx" ON "avisos"("team", "status");

-- CreateIndex
CREATE INDEX "avisos_team_dateISO_idx" ON "avisos"("team", "dateISO");

-- CreateIndex
CREATE INDEX "avisos_team_createdAt_idx" ON "avisos"("team", "createdAt");

-- CreateIndex
CREATE INDEX "avisos_targetUserId_idx" ON "avisos"("targetUserId");

-- CreateIndex
CREATE INDEX "avisos_createdById_idx" ON "avisos"("createdById");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
