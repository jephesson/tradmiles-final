import { prisma } from "@/lib/prisma";

export type UpcomingSmilesFlight = {
  saleId: string;
  numero: string;
  locator: string | null;
  departureDate: string | null;
  returnDate: string | null;
  departureAirportIata: string | null;
  /** Próxima data relevante (ida ou volta), ISO */
  nextEventAt: string;
};

function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
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

export function formatUpcomingSmilesFlightsWarning(flights: UpcomingSmilesFlight[]): string {
  if (!flights.length) return "";

  const lines = flights.map((f, i) => {
    const ida = fmtDateBR(f.departureDate);
    const volta = fmtDateBR(f.returnDate);
    const loc = f.locator?.trim() ? ` • loc. ${f.locator.trim()}` : "";
    const iata = f.departureAirportIata?.trim()
      ? ` (${f.departureAirportIata.trim()})`
      : "";

    const parts: string[] = [];
    if (ida) parts.push(`Ida: ${ida}${iata}`);
    if (volta) parts.push(`Volta: ${volta}`);

    const when =
      parts.length > 0
        ? parts.join(" • ")
        : `Próximo evento: ${fmtDateBR(f.nextEventAt) || "—"}`;

    return `${i + 1}. Venda ${f.numero}${loc}\n   ${when}`;
  });

  return [
    "",
    `⚠️ ATENÇÃO: há ${flights.length} voo(s) Smiles ainda por ocorrer:`,
    "",
    ...lines,
    "",
  ].join("\n");
}

export function appendSmilesFlightsToExclusaoConfirm(
  baseMessage: string,
  flights: UpcomingSmilesFlight[]
): string {
  const warning = formatUpcomingSmilesFlightsWarning(flights);
  if (!warning) return baseMessage;
  return `${baseMessage}${warning}Deseja mesmo continuar com a exclusão?`;
}
