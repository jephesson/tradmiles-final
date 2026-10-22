CREATE TABLE "agenda_fill_locks" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "locked" BOOLEAN NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agenda_fill_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_agenda_fill_lock_team_month" ON "agenda_fill_locks"("team", "month");
CREATE INDEX "agenda_fill_locks_team_idx" ON "agenda_fill_locks"("team");
