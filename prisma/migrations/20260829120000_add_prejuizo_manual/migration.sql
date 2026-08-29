-- CreateTable
CREATE TABLE "prejuizos_manuais" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prejuizos_manuais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prejuizos_manuais_team_occurredAt_idx" ON "prejuizos_manuais"("team", "occurredAt");

-- CreateIndex
CREATE INDEX "prejuizos_manuais_team_canceledAt_idx" ON "prejuizos_manuais"("team", "canceledAt");

-- AddForeignKey
ALTER TABLE "prejuizos_manuais" ADD CONSTRAINT "prejuizos_manuais_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
