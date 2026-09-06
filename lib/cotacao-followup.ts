import { prisma } from "@/lib/prisma";
import { ciaKeyFromMilesAirline, isScoutAirline } from "@/lib/cotacao-passagens";
import { mergeQuoteLeg, type QuoteCiaCell } from "@/lib/cotacao-quote-cia";

export async function enqueueCotacaoFollowups(jobId: string) {
  const job = await prisma.cotacaoPassagemJob.findUnique({
    where: { id: jobId },
    include: { searches: true },
  });
  if (!job || job.status !== "RUNNING") return;

  await prisma.cotacaoPassagemSearch.updateMany({
    where: {
      jobId,
      status: { in: ["PENDING", "RUNNING"] },
      NOT: { airline: { equals: "Google", mode: "insensitive" } },
    },
    data: { status: "CANCELADO", error: "À vista via Google Flights (SerpAPI).", finishedAt: new Date() },
  });

  const pending = await prisma.cotacaoPassagemSearch.findFirst({
    where: { jobId, status: { in: ["PENDING", "RUNNING"] }, airline: { equals: "Google", mode: "insensitive" } },
    select: { id: true },
  });
  if (pending) return;

  const scouts = job.searches.filter((s) => isScoutAirline(s.airline));
  if (!scouts.length) return;

  await prisma.cotacaoPassagemJob.update({
    where: { id: jobId },
    data: { status: "DONE" },
  });
}

export async function mergeMilesIntoQuoteCia(
  jobId: string,
  airline: string,
  miles: number,
  direction: "IDA" | "VOLTA" = "IDA"
) {
  const key = ciaKeyFromMilesAirline(airline);
  if (!key || miles <= 0) return;
  const job = await prisma.cotacaoPassagemJob.findUnique({
    where: { id: jobId },
    select: { quoteCia: true },
  });
  if (!job) return;
  const current = (job.quoteCia && typeof job.quoteCia === "object" ? job.quoteCia : {}) as Record<
    string,
    QuoteCiaCell
  >;
  const prev = current[key] || {};
  await prisma.cotacaoPassagemJob.update({
    where: { id: jobId },
    data: {
      quoteCia: {
        ...current,
        [key]: mergeQuoteLeg(prev, direction, { miles }),
      },
    },
  });
}
