-- CreateTable
CREATE TABLE "employee_month_goals" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "salesGoalCents" INTEGER NOT NULL DEFAULT 0,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_month_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_employee_month_goal_team_month_user" ON "employee_month_goals"("team", "month", "userId");

-- CreateIndex
CREATE INDEX "employee_month_goals_team_month_idx" ON "employee_month_goals"("team", "month");

-- CreateIndex
CREATE INDEX "employee_month_goals_userId_idx" ON "employee_month_goals"("userId");

-- AddForeignKey
ALTER TABLE "employee_month_goals" ADD CONSTRAINT "employee_month_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
