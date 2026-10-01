-- CreateTable
CREATE TABLE "card_cashback_months" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "cashbackCents" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_cashback_months_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_card_cashback_team_month_user" ON "card_cashback_months"("team", "month", "userId");

-- CreateIndex
CREATE INDEX "card_cashback_months_team_month_idx" ON "card_cashback_months"("team", "month");

-- AddForeignKey
ALTER TABLE "card_cashback_months" ADD CONSTRAINT "card_cashback_months_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_cashback_months" ADD CONSTRAINT "card_cashback_months_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
