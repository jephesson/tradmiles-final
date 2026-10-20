import { prisma } from "@/lib/prisma";
import { mergeTelegramApiCreds, type TelegramApiCreds } from "@/lib/telegram/creds";

export function teamTelegram(team: string) {
  return prisma.telegramAccount.findUnique({
    where: { team },
  });
}

export async function resolveTelegramCreds(team: string): Promise<TelegramApiCreds | null> {
  return mergeTelegramApiCreds(await teamTelegram(team));
}
