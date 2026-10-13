import { prisma } from "@/lib/prisma";

export async function loadValidatedHolidayISOs(team: string) {
  const rows = await prisma.agendaHoliday.findMany({
    where: { team },
    select: { dateISO: true },
  });
  return new Set(rows.map((r) => r.dateISO));
}
