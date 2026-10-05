-- AlterTable
ALTER TABLE "inter_pix_payments" ADD COLUMN "cardDebtInstallmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "card_debt_creditors" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixTipo" "PixTipo",
    "chavePix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_debt_creditors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_debt_purchases" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "creditorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "importKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_debt_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_debt_installments" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paidAt" TIMESTAMP(3),
    "paidVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_debt_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "card_debt_creditors_team_name_key" ON "card_debt_creditors"("team", "name");

-- CreateIndex
CREATE INDEX "card_debt_creditors_team_idx" ON "card_debt_creditors"("team");

-- CreateIndex
CREATE UNIQUE INDEX "card_debt_purchases_importKey_key" ON "card_debt_purchases"("importKey");

-- CreateIndex
CREATE INDEX "card_debt_purchases_team_creditorId_idx" ON "card_debt_purchases"("team", "creditorId");

-- CreateIndex
CREATE UNIQUE INDEX "card_debt_installments_purchaseId_n_key" ON "card_debt_installments"("purchaseId", "n");

-- CreateIndex
CREATE INDEX "card_debt_installments_dueDate_status_idx" ON "card_debt_installments"("dueDate", "status");

-- CreateIndex
CREATE INDEX "card_debt_installments_status_idx" ON "card_debt_installments"("status");

-- AddForeignKey
ALTER TABLE "card_debt_purchases" ADD CONSTRAINT "card_debt_purchases_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "card_debt_creditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_debt_installments" ADD CONSTRAINT "card_debt_installments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "card_debt_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
