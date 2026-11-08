-- CreateTable
CREATE TABLE "scheduled_alerts" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT,
    "durationMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_alerts_userId_date_idx" ON "scheduled_alerts"("userId", "date");

-- AddForeignKey
ALTER TABLE "scheduled_alerts" ADD CONSTRAINT "scheduled_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
