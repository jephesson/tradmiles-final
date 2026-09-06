import { prisma } from "@/lib/prisma";
import {
  cashSearchForCarrier,
  ciaKeyFromMilesAirline,
  isCashAirline,
  isMilesAirline,
  isScoutAirline,
  milesAirlineSearches,
  normalizeCarrier,
} from "@/lib/cotacao-passagens";

type SearchRow = {
  id: string;
  direction: string;
  originIata: string;
  destIata: string;
  date: string;
  airline: string;
  status: string;
  priceCents: number;
  rawPrice: string | null;
};

function routeKey(s: Pick<SearchRow, "direction" | "originIata" | "destIata">) {
  return `${s.direction}|${s.originIata}|${s.destIata}`;
}

function cheapestScout(rows: SearchRow[]) {
  const ok = rows.filter((s) => s.status === "OK" && s.priceCents > 0);
  ok.sort((a, b) => a.priceCents - b.priceCents || a.date.localeCompare(b.date));
  return ok[0] || null;
}

function carrierOf(row: SearchRow) {
  return normalizeCarrier(`${row.airline} ${row.rawPrice || ""}`);
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
  const cash = job.searches.filter((s) => isCashAirline(s.airline));
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

  if (scouts.length) {
    const groups = new Map<string, SearchRow[]>();
    for (const s of scouts) {
      const k = routeKey(s);
      const list = groups.get(k) || [];
      list.push(s);
      groups.set(k, list);
    }
    for (const rows of groups.values()) {
      const winner = cheapestScout(rows);
      if (!winner) continue;
      const alreadyCash = cash.some((c) => c.direction === winner.direction && c.date === winner.date);
      if (alreadyCash) continue;
      const cia = carrierOf(winner);
      for (const item of cashSearchForCarrier(cia, winner.originIata, winner.destIata, winner.date, adults)) {
        add({ ...item, direction: winner.direction, date: winner.date });
      }
    }
  }

  const cashOk = cash.filter((s) => s.status === "OK" && s.priceCents > 0);
  const selected = new Map<string, SearchRow>();
  if (scouts.length) {
    const groups = new Map<string, SearchRow[]>();
    for (const s of scouts) {
      const k = s.direction;
      const list = groups.get(k) || [];
      list.push(s);
      groups.set(k, list);
    }
    for (const [direction, rows] of groups) {
      const winner = cheapestScout(rows);
      if (!winner) continue;
    const confirmed =
      cashOk.filter((c) => c.direction === direction && c.date === winner.date).sort((a, b) => a.priceCents - b.priceCents)[0] ||
      null;
    selected.set(direction, confirmed || winner);
    }
  } else {
    for (const direction of ["IDA", "VOLTA"]) {
    const dirCash = cash.filter((c) => c.direction === direction);
    if (!dirCash.length) continue;
    const best = cashOk.filter((c) => c.direction === direction).sort((a, b) => a.priceCents - b.priceCents)[0] || dirCash[0];
    selected.set(direction, best);
    }
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
