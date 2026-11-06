-- CreateTable
CREATE TABLE "sales_hourly_days" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "hours" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_hourly_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_hourly_days_team_day_key" ON "sales_hourly_days"("team", "day");
