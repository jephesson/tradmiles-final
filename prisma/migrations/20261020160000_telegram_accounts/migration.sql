-- CreateTable
CREATE TABLE "telegram_accounts" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sessionEnc" TEXT NOT NULL DEFAULT '',
    "phoneCodeHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "telegramUserId" TEXT,
    "telegramName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telegram_accounts_team_userId_key" ON "telegram_accounts"("team", "userId");

-- CreateIndex
CREATE INDEX "telegram_accounts_team_idx" ON "telegram_accounts"("team");

-- AddForeignKey
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
