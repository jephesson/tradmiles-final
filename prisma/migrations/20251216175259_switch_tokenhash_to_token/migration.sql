/*
  Warnings:

  - You are about to drop the `cedente_invites` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `ownerId` to the `cedentes` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "cedente_invites" DROP CONSTRAINT "cedente_invites_cedenteId_fkey";

-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN     "ownerId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- DropTable
DROP TABLE "cedente_invites";

-- CreateTable
CREATE TABLE "employee_invites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_userId_key" ON "employee_invites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_code_key" ON "employee_invites"("code");

-- CreateIndex
CREATE INDEX "cedentes_ownerId_idx" ON "cedentes"("ownerId");

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
