import { prisma } from "@/lib/prisma";

export function teamTelegram(team: string) {
  return prisma.telegramAccount.findUnique({
    where: { team },
  });
}
