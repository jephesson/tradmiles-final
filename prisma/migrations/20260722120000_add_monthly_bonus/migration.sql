-- CreateTable
CREATE TABLE "bonus_month_settings" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "revenueGoalCents" INTEGER NOT NULL DEFAULT 0,
    "profitGoalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_month_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_month_results" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grossBonusCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "netBonusCents" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonus_month_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_bonus_month_setting_team_month" ON "bonus_month_settings"("team", "month");

-- CreateIndex
CREATE INDEX "bonus_month_settings_team_month_idx" ON "bonus_month_settings"("team", "month");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_bonus_month_result_team_month_user" ON "bonus_month_results"("team", "month", "userId");

-- CreateIndex
CREATE INDEX "bonus_month_results_team_month_idx" ON "bonus_month_results"("team", "month");

-- CreateIndex
CREATE INDEX "bonus_month_results_userId_idx" ON "bonus_month_results"("userId");

-- AddForeignKey
ALTER TABLE "bonus_month_results" ADD CONSTRAINT "bonus_month_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_month_results" ADD CONSTRAINT "bonus_month_results_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
