-- Sessão da extensão LATAM (persistida; serverless não guarda memória)
CREATE TABLE IF NOT EXISTS "latam_fill_sessions" (
  "userId" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "useExtension" BOOLEAN NOT NULL DEFAULT false,
  "passengersJson" TEXT NOT NULL DEFAULT '[]',
  "paymentCardId" TEXT,
  "saleHint" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "latam_fill_sessions_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX IF NOT EXISTS "latam_fill_sessions_team_idx" ON "latam_fill_sessions"("team");

ALTER TABLE "latam_fill_sessions"
  ADD CONSTRAINT "latam_fill_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
