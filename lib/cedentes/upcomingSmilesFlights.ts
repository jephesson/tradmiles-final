import { prisma } from "@/lib/prisma";
import type { UpcomingSmilesFlight } from "@/lib/cedentes/upcomingSmilesFlightsShared";

export type { UpcomingSmilesFlight } from "@/lib/cedentes/upcomingSmilesFlightsShared";
export {
  appendSmilesFlightsToExclusaoConfirm,
  formatUpcomingSmilesFlightsWarning,
} from "@/lib/cedentes/upcomingSmilesFlightsShared";

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function earliestUpcomingMs(
  departureDate: Date | null,
  returnDate: Date | null,
  nowMs: number
): number | null {
  const candidates: number[] = [];
  if (departureDate && !Number.isNaN(departureDate.getTime())) {
    candidates.push(departureDate.getTime());
  }
  if (returnDate && !Number.isNaN(returnDate.getTime())) {
    candidates.push(returnDate.getTime());
  }
  const upcoming = candidates.filter((ms) => ms >= nowMs);
  if (!upcoming.length) return null;
  return Math.min(...upcoming);
}

export async function listUpcomingSmilesFlightsForCedente(
  cedenteId: string
): Promise<UpcomingSmilesFlight[]> {
  const today = startOfTodayLocal();
  const nowMs = today.getTime();

  const sales = await prisma.sale.findMany({
    where: {
      cedenteId,
      program: "SMILES",
      OR: [{ departureDate: { gte: today } }, { returnDate: { gte: today } }],
    },
    select: {
      id: true,
      numero: true,
      locator: true,
      departureDate: true,
      returnDate: true,
      departureAirportIata: true,
    },
    orderBy: [{ departureDate: "asc" }, { returnDate: "asc" }],
    take: 50,
  });

  const mapped: UpcomingSmilesFlight[] = [];

  for (const s of sales) {
    const nextMs = earliestUpcomingMs(s.departureDate, s.returnDate, nowMs);
    if (nextMs == null) continue;

    mapped.push({
      saleId: s.id,
      numero: s.numero,
      locator: s.locator,
      departureDate: s.departureDate?.toISOString() ?? null,
      returnDate: s.returnDate?.toISOString() ?? null,
      departureAirportIata: s.departureAirportIata,
      nextEventAt: new Date(nextMs).toISOString(),
    });
  }

  mapped.sort(
    (a, b) => new Date(a.nextEventAt).getTime() - new Date(b.nextEventAt).getTime()
  );

  return mapped;
}
