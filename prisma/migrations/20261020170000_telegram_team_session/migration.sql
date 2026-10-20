-- A sessão Telegram fica da empresa (um login) e lembra a última conversa.
DROP INDEX IF EXISTS "telegram_accounts_team_userId_key";

CREATE UNIQUE INDEX "telegram_accounts_team_key" ON "telegram_accounts"("team");

CREATE INDEX IF NOT EXISTS "telegram_accounts_userId_idx" ON "telegram_accounts"("userId");

ALTER TABLE "telegram_accounts" ADD COLUMN IF NOT EXISTS "lastChatId" TEXT;
ALTER TABLE "telegram_accounts" ADD COLUMN IF NOT EXISTS "lastChatTitle" TEXT;
