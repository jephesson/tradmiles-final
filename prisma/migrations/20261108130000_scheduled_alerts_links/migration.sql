-- AlterTable
ALTER TABLE "scheduled_alerts" ADD COLUMN "cedenteId" TEXT,
ADD COLUMN "linkedUserId" TEXT;

-- AddForeignKey
ALTER TABLE "scheduled_alerts" ADD CONSTRAINT "scheduled_alerts_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_alerts" ADD CONSTRAINT "scheduled_alerts_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
