-- CreateTable
CREATE TABLE "problem_report_updates" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "statusTo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_report_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_report_updates_reportId_createdAt_idx" ON "problem_report_updates"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "problem_report_updates" ADD CONSTRAINT "problem_report_updates_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "problem_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_report_updates" ADD CONSTRAINT "problem_report_updates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
