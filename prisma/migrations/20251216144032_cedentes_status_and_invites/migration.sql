/*
  Warnings:

  - A unique constraint covering the columns `[cedenteId]` on the table `cedente_invites` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CedenteStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "cedente_invites" ADD COLUMN     "cedenteId" TEXT;

-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "CedenteStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE UNIQUE INDEX "cedente_invites_cedenteId_key" ON "cedente_invites"("cedenteId");

-- CreateIndex
CREATE INDEX "cedente_invites_usedAt_idx" ON "cedente_invites"("usedAt");

-- CreateIndex
CREATE INDEX "cedentes_status_idx" ON "cedentes"("status");

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_invites" ADD CONSTRAINT "cedente_invites_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
