-- CreateTable
CREATE TABLE "problem_reports" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram",
    "problemDate" TEXT NOT NULL,
    "protocols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_reports_team_status_idx" ON "problem_reports"("team", "status");

-- CreateIndex
CREATE INDEX "problem_reports_cedenteId_idx" ON "problem_reports"("cedenteId");

-- AddForeignKey
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_reports" ADD CONSTRAINT "problem_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
