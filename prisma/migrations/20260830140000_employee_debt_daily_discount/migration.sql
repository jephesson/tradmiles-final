-- CreateEnum
CREATE TYPE "DividaReceberKind" AS ENUM ('GERAL', 'FUNCIONARIO');

-- AlterTable employee_payouts
ALTER TABLE "employee_payouts" ADD COLUMN "manualDiscountCents" INTEGER NOT NULL DEFAULT 0;
UPDATE "employee_payouts" SET "manualDiscountCents" = "discountCents";

-- AlterTable dividas_a_receber
ALTER TABLE "dividas_a_receber" ADD COLUMN "kind" "DividaReceberKind" NOT NULL DEFAULT 'GERAL';
ALTER TABLE "dividas_a_receber" ADD COLUMN "employeeUserId" TEXT;
ALTER TABLE "dividas_a_receber" ADD COLUMN "dailyProfitBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dividas_a_receber" ADD COLUMN "startsOn" TEXT;

-- CreateTable
CREATE TABLE "employee_debt_day_charges" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "lucroBaseCents" INTEGER NOT NULL DEFAULT 0,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_debt_day_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_debt_day_charges_paymentId_key" ON "employee_debt_day_charges"("paymentId");
CREATE UNIQUE INDEX "employee_debt_day_charges_dividaId_date_key" ON "employee_debt_day_charges"("dividaId", "date");
CREATE INDEX "employee_debt_day_charges_team_date_userId_idx" ON "employee_debt_day_charges"("team", "date", "userId");
CREATE INDEX "dividas_a_receber_team_kind_employeeUserId_idx" ON "dividas_a_receber"("team", "kind", "employeeUserId");

-- AddForeignKey
ALTER TABLE "dividas_a_receber" ADD CONSTRAINT "dividas_a_receber_employeeUserId_fkey" FOREIGN KEY ("employeeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_debt_day_charges" ADD CONSTRAINT "employee_debt_day_charges_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas_a_receber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
