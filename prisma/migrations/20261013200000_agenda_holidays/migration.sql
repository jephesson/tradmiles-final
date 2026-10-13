CREATE TABLE "agenda_holidays" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "dateISO" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agenda_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_agenda_holiday_team_date" ON "agenda_holidays"("team", "dateISO");
CREATE INDEX "agenda_holidays_team_dateISO_idx" ON "agenda_holidays"("team", "dateISO");

ALTER TABLE "agenda_holidays"
  ADD CONSTRAINT "agenda_holidays_validatedById_fkey"
  FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
