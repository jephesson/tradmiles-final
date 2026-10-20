-- CreateTable
CREATE TABLE "telegram_emission_examples" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "userId" TEXT,
    "origin" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT '',
    "outbound" TEXT NOT NULL DEFAULT '',
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "chatSnippet" TEXT NOT NULL DEFAULT '',
    "passengerText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_emission_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telegram_emission_examples_team_createdAt_idx" ON "telegram_emission_examples"("team", "createdAt");

-- CreateIndex
CREATE INDEX "telegram_emission_examples_team_origin_destination_idx" ON "telegram_emission_examples"("team", "origin", "destination");
