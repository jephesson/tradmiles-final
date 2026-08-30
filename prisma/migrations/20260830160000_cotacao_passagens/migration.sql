-- CreateEnum
CREATE TYPE "CotacaoJobStatus" AS ENUM ('RUNNING', 'DONE', 'STOPPED');

-- CreateEnum
CREATE TYPE "CotacaoSearchStatus" AS ENUM ('PENDING', 'RUNNING', 'OK', 'ERRO', 'CANCELADO');

-- CreateTable
CREATE TABLE "cotacao_passagem_jobs" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "status" "CotacaoJobStatus" NOT NULL DEFAULT 'RUNNING',
    "origins" TEXT NOT NULL,
    "destinations" TEXT NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "outboundFrom" TEXT NOT NULL,
    "outboundTo" TEXT,
    "outboundDays" INTEGER NOT NULL DEFAULT 1,
    "includeReturn" BOOLEAN NOT NULL DEFAULT true,
    "returnFrom" TEXT,
    "returnTo" TEXT,
    "returnDays" INTEGER,
    "quoteMiles" INTEGER NOT NULL DEFAULT 0,
    "quoteMilheiroCents" INTEGER NOT NULL DEFAULT 0,
    "quoteBoardingFeeCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacao_passagem_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotacao_passagem_searches" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "originIata" TEXT NOT NULL,
    "destIata" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "CotacaoSearchStatus" NOT NULL DEFAULT 'PENDING',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "airline" TEXT NOT NULL DEFAULT '',
    "rawPrice" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacao_passagem_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotacao_passagem_jobs_team_ownerId_createdAt_idx" ON "cotacao_passagem_jobs"("team", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "cotacao_passagem_jobs_status_idx" ON "cotacao_passagem_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cotacao_passagem_searches_jobId_direction_originIata_destIata_date_key" ON "cotacao_passagem_searches"("jobId", "direction", "originIata", "destIata", "date");

-- CreateIndex
CREATE INDEX "cotacao_passagem_searches_jobId_status_idx" ON "cotacao_passagem_searches"("jobId", "status");

-- AddForeignKey
ALTER TABLE "cotacao_passagem_jobs" ADD CONSTRAINT "cotacao_passagem_jobs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacao_passagem_searches" ADD CONSTRAINT "cotacao_passagem_searches_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "cotacao_passagem_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
