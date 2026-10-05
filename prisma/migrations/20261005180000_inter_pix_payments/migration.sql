-- AlterTable
ALTER TABLE "users" ADD COLUMN "pixTipo" "PixTipo",
ADD COLUMN "chavePix" TEXT;

-- CreateTable
CREATE TABLE "inter_pix_payments" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "employeePayoutId" TEXT,
    "cedenteCommissionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "pixTipo" TEXT NOT NULL,
    "pixKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "codigoSolicitacao" TEXT,
    "tipoRetorno" TEXT,
    "interStatus" TEXT,
    "endToEnd" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "errorMessage" TEXT,
    "rawCreate" JSONB,
    "rawLast" JSONB,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inter_pix_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inter_pix_payments_idempotencyKey_key" ON "inter_pix_payments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "inter_pix_payments_codigoSolicitacao_key" ON "inter_pix_payments"("codigoSolicitacao");

-- CreateIndex
CREATE INDEX "inter_pix_payments_team_kind_status_idx" ON "inter_pix_payments"("team", "kind", "status");

-- CreateIndex
CREATE INDEX "inter_pix_payments_employeePayoutId_idx" ON "inter_pix_payments"("employeePayoutId");

-- CreateIndex
CREATE INDEX "inter_pix_payments_cedenteCommissionId_idx" ON "inter_pix_payments"("cedenteCommissionId");

-- AddForeignKey
ALTER TABLE "inter_pix_payments" ADD CONSTRAINT "inter_pix_payments_employeePayoutId_fkey" FOREIGN KEY ("employeePayoutId") REFERENCES "employee_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inter_pix_payments" ADD CONSTRAINT "inter_pix_payments_cedenteCommissionId_fkey" FOREIGN KEY ("cedenteCommissionId") REFERENCES "cedente_commissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inter_pix_payments" ADD CONSTRAINT "inter_pix_payments_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
