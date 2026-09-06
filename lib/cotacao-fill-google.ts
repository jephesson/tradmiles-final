import { prisma } from "@/lib/prisma";
import { parseClock } from "@/lib/cotacao-passagens";
import { enqueueCotacaoFollowups } from "@/lib/cotacao-followup";
import { searchGoogleFlightsCheapest } from "@/lib/serpapi-flights";

export async function fillPendingGoogleFlights(jobId: string, limit = 4) {
  const job = await prisma.cotacaoPassagemJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      adults: true,
      filterMaxDurationMin: true,
      filterDepFrom: true,
      filterDepTo: true,
      filterDirectOnly: true,
    },
  });
  if (!job || job.status !== "RUNNING") return { filled: 0 };

  const stale = new Date(Date.now() - 90_000);
  await prisma.cotacaoPassagemSearch.updateMany({
    where: {
      jobId,
      status: "RUNNING",
      airline: { equals: "Google", mode: "insensitive" },
      startedAt: { lt: stale },
    },
    data: { status: "PENDING", startedAt: null },
  });

  let filled = 0;
  for (let i = 0; i < Math.max(1, Math.min(20, limit)); i += 1) {
    const row = await prisma.$transaction(async (tx) => {
      const next = await tx.cotacaoPassagemSearch.findFirst({
        where: {
          jobId,
          status: "PENDING",
          airline: { equals: "Google", mode: "insensitive" },
        },
        orderBy: [{ direction: "asc" }, { date: "asc" }],
      });
      if (!next) return null;
      return tx.cotacaoPassagemSearch.update({
        where: { id: next.id },
        data: { status: "RUNNING", startedAt: new Date() },
      });
    });
    if (!row) break;

    const result = await searchGoogleFlightsCheapest(row.originIata, row.destIata, row.date, {
      adults: job.adults,
      directOnly: Boolean(job.filterDirectOnly),
      maxDurationMin: job.filterMaxDurationMin,
      depFrom: job.filterDepFrom,
      depTo: job.filterDepTo,
    });
    if ("error" in result) {
      await prisma.cotacaoPassagemSearch.update({
        where: { id: row.id },
        data: {
          status: "ERRO",
          error: result.error.slice(0, 400),
          finishedAt: new Date(),
        },
      });
    } else {
      await prisma.cotacaoPassagemSearch.update({
        where: { id: row.id },
        data: {
          status: "OK",
          priceCents: result.priceCents,
          airline: "Google",
          rawPrice: result.rawPrice.slice(0, 200),
          url: result.googleUrl || row.url,
          depTime: parseClock(result.depTime) || null,
          arrTime: parseClock(result.arrTime) || null,
          durationMin: result.durationMin > 0 ? result.durationMin : null,
          stops: result.stops,
          error: null,
          finishedAt: new Date(),
        },
      });
    }
    filled += 1;
  }

  await enqueueCotacaoFollowups(jobId);
  return { filled };
}
