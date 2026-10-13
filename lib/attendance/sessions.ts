import { prisma } from "@/lib/prisma";
import { SESSION_IDLE_MS } from "@/lib/session-idle";

export async function touchWorkSession(team: string, userId: string, now = new Date()) {
  const idleCut = new Date(now.getTime() - SESSION_IDLE_MS);
  const open = await prisma.workSession.findFirst({
    where: {
      team,
      userId,
      endedAt: null,
      lastActivityAt: { gte: idleCut },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (open) {
    return prisma.workSession.update({
      where: { id: open.id },
      data: { lastActivityAt: now },
    });
  }
  return prisma.workSession.create({
    data: { team, userId, startedAt: now, lastActivityAt: now },
  });
}

export async function endWorkSession(team: string, userId: string, now = new Date()) {
  await prisma.workSession.updateMany({
    where: { team, userId, endedAt: null },
    data: { endedAt: now },
  });
}
