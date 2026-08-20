-- CreateTable
CREATE TABLE "pix_payer_aliases" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "payerNameNorm" TEXT NOT NULL,
    "payerNameRaw" TEXT,
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pix_payer_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_pix_payer_alias_team_name" ON "pix_payer_aliases"("team", "payerNameNorm");

-- CreateIndex
CREATE INDEX "pix_payer_aliases_team_idx" ON "pix_payer_aliases"("team");

-- CreateIndex
CREATE INDEX "pix_payer_aliases_clienteId_idx" ON "pix_payer_aliases"("clienteId");

-- AddForeignKey
ALTER TABLE "pix_payer_aliases" ADD CONSTRAINT "pix_payer_aliases_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
