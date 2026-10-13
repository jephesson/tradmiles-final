CREATE TABLE "work_sessions" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "lastActivityAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_sessions_team_userId_startedAt_idx" ON "work_sessions"("team", "userId", "startedAt");
CREATE INDEX "work_sessions_team_userId_endedAt_idx" ON "work_sessions"("team", "userId", "endedAt");

ALTER TABLE "work_sessions"
  ADD CONSTRAINT "work_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "attendance_period_settings" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "startISO" TEXT NOT NULL,
  "endISO" TEXT NOT NULL,
  "weeklyHoursMin" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "bonusCents" INTEGER NOT NULL DEFAULT 20000,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_period_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_attendance_period_team_month" ON "attendance_period_settings"("team", "month");
CREATE INDEX "attendance_period_settings_team_month_idx" ON "attendance_period_settings"("team", "month");

CREATE TABLE "attendance_emission_credits" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "dateISO" TEXT NOT NULL,
  "hours" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_emission_credits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_emission_credits_saleId_key" ON "attendance_emission_credits"("saleId");
CREATE INDEX "attendance_emission_credits_team_userId_dateISO_idx" ON "attendance_emission_credits"("team", "userId", "dateISO");

ALTER TABLE "attendance_emission_credits"
  ADD CONSTRAINT "attendance_emission_credits_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "attendance_awards" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "declaredHours" DOUBLE PRECISION NOT NULL,
  "fulfilledHours" DOUBLE PRECISION NOT NULL,
  "creditHours" DOUBLE PRECISION NOT NULL,
  "attendance" DOUBLE PRECISION NOT NULL,
  "bonusCents" INTEGER NOT NULL,
  "breakdown" JSONB,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "paidById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "attendance_awards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_attendance_award_team_month" ON "attendance_awards"("team", "month");
CREATE INDEX "attendance_awards_team_month_idx" ON "attendance_awards"("team", "month");

ALTER TABLE "attendance_awards"
  ADD CONSTRAINT "attendance_awards_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_awards"
  ADD CONSTRAINT "attendance_awards_paidById_fkey"
  FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
