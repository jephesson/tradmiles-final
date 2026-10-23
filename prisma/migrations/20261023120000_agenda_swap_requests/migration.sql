-- CreateEnum
CREATE TYPE "AgendaSwapStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED');

-- CreateTable
CREATE TABLE "agenda_swap_requests" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "status" "AgendaSwapStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fromEventId" TEXT,
    "toEventId" TEXT,
    "note" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_swap_requests_team_targetId_status_idx" ON "agenda_swap_requests"("team", "targetId", "status");

-- CreateIndex
CREATE INDEX "agenda_swap_requests_team_requesterId_status_idx" ON "agenda_swap_requests"("team", "requesterId", "status");

-- AddForeignKey
ALTER TABLE "agenda_swap_requests" ADD CONSTRAINT "agenda_swap_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_swap_requests" ADD CONSTRAINT "agenda_swap_requests_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_swap_requests" ADD CONSTRAINT "agenda_swap_requests_fromEventId_fkey" FOREIGN KEY ("fromEventId") REFERENCES "agenda_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_swap_requests" ADD CONSTRAINT "agenda_swap_requests_toEventId_fkey" FOREIGN KEY ("toEventId") REFERENCES "agenda_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

