import { prisma } from "@/lib/prisma";
import { ciaKeyFromMilesAirline, isMilesAirline, isScoutAirline, milesAirlineSearches } from "@/lib/cotacao-passagens";

type SearchRow = {
  direction: string;
  originIata: string;
  destIata: string;
  date: string;
  airline: string;
  status: string;
  priceCents: number;
};

function cheapestScout(rows: SearchRow[]) {
  const ok = rows.filter((s) => s.status === "OK" && s.priceCents > 0);
  ok.sort((a, b) => a.priceCents - b.priceCents || a.date.localeCompare(b.date));
  return ok[0] || null;
}

export async function enqueueCotacaoFollowups(jobId: string) {
  const job = await prisma.cotacaoPassagemJob.findUnique({
    where: { id: jobId },
    include: { searches: true },
  });
  if (!job || job.status !== "RUNNING") return;

  const pending = job.searches.some((s) => s.status === "PENDING" || s.status === "RUNNING");
  if (pending) return;

  const adults = Math.max(1, job.adults || 1);
  const scouts = job.searches.filter((s) => isScoutAirline(s.airline));
  const miles = job.searches.filter((s) => isMilesAirline(s.airline));

  const toCreate: {
    direction: string;
    originIata: string;
    destIata: string;
    date: string;
    url: string;
    airline: string;
  }[] = [];
  const seen = new Set(job.searches.map((s) => `${s.direction}|${s.airline}|${s.originIata}|${s.destIata}|${s.date}`));

  function add(item: (typeof toCreate)[number]) {
    const k = `${item.direction}|${item.airline}|${item.originIata}|${item.destIata}|${item.date}`;
    if (seen.has(k) || !item.url) return;
    seen.add(k);
    toCreate.push(item);
  }

  const selected = new Map<string, SearchRow>();
  const groups = new Map<string, SearchRow[]>();
  for (const s of scouts) {
    const list = groups.get(s.direction) || [];
    list.push(s);
    groups.set(s.direction, list);
  }
  for (const [direction, rows] of groups) {
    const winner = cheapestScout(rows);
    if (winner) selected.set(direction, winner);
  }

  for (const row of selected.values()) {
    const alreadyMiles = miles.some((m) => m.direction === row.direction && m.date === row.date);
    if (alreadyMiles) continue;
    for (const item of milesAirlineSearches(row.originIata, row.destIata, row.date, adults)) {
      add({ ...item, direction: row.direction, date: row.date });
    }
  }

  if (toCreate.length) {
    await prisma.cotacaoPassagemSearch.createMany({
      data: toCreate.map((s) => ({ ...s, jobId })),
      skipDuplicates: true,
    });
    return;
  }

  await prisma.cotacaoPassagemJob.update({
    where: { id: jobId },
    data: { status: "DONE" },
  });
}

export async function mergeMilesIntoQuoteCia(jobId: string, airline: string, miles: number) {
  const key = ciaKeyFromMilesAirline(airline);
  if (!key || miles <= 0) return;
  const job = await prisma.cotacaoPassagemJob.findUnique({
    where: { id: jobId },
    select: { quoteCia: true },
  });
  if (!job) return;
  const current = (job.quoteCia && typeof job.quoteCia === "object" ? job.quoteCia : {}) as Record<
    string,
    { miles?: number; feeCents?: number; milheiroCents?: number }
  >;
  const prev = current[key] || {};
  await prisma.cotacaoPassagemJob.update({
    where: { id: jobId },
    data: {
      quoteCia: {
        ...current,
        [key]: { miles, feeCents: prev.feeCents || 0, milheiroCents: prev.milheiroCents || 0 },
      },
    },
  });
}
