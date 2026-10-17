-- CreateTable
CREATE TABLE "employee_debt_rates" (
    "id" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "dailyProfitBps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_debt_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_debt_rates_dividaId_effectiveFrom_key" ON "employee_debt_rates"("dividaId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "employee_debt_rates_dividaId_idx" ON "employee_debt_rates"("dividaId");

-- AddForeignKey
ALTER TABLE "employee_debt_rates" ADD CONSTRAINT "employee_debt_rates_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas_a_receber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill
INSERT INTO "employee_debt_rates" ("id", "dividaId", "effectiveFrom", "dailyProfitBps", "createdAt")
SELECT
  md5(d."id" || ':rate0'),
  d."id",
  COALESCE(d."startsOn", to_char((d."createdAt" AT TIME ZONE 'America/Recife'), 'YYYY-MM-DD')),
  d."dailyProfitBps",
  NOW()
FROM "dividas_a_receber" d
WHERE d."kind" = 'FUNCIONARIO'
  AND d."dailyProfitBps" > 0
ON CONFLICT ("dividaId", "effectiveFrom") DO NOTHING;
