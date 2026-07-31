-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN "emailRedirecionado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cedentes" ADD COLUMN "emailRedirecionadoAt" TIMESTAMP(3);
ALTER TABLE "cedentes" ADD COLUMN "emailRedirecionadoById" TEXT;

-- CreateIndex
CREATE INDEX "cedentes_emailRedirecionado_idx" ON "cedentes"("emailRedirecionado");
