import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { inferQuoteDirection, mergeQuoteLeg, quoteLeg, type QuoteCiaCell } from "@/lib/cotacao-quote-cia";
import { ciaKeyFromMilesAirline } from "@/lib/cotacao-passagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const job = await prisma.cotacaoPassagemJob.findFirst({
    where: { id: String(id || ""), team: session.team, ownerId: session.id },
  });
  if (!job) return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });

  if (body.stop) {
    await prisma.cotacaoPassagemSearch.updateMany({
      where: { jobId: job.id, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "CANCELADO", finishedAt: new Date() },
    });
    const updated = await prisma.cotacaoPassagemJob.update({
      where: { id: job.id },
      data: { status: "STOPPED" },
      include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
    });
    return NextResponse.json({ ok: true, job: updated });
  }

  const data: Record<string, unknown> = {};
  if (body.clearQuote) {
    const milesRows = await prisma.cotacaoPassagemSearch.findMany({
      where: { jobId: job.id },
      select: { id: true, airline: true },
    });
    const milesIds = milesRows.filter((s) => ciaKeyFromMilesAirline(s.airline)).map((s) => s.id);
    if (milesIds.length) {
      await prisma.cotacaoPassagemSearch.updateMany({
        where: { id: { in: milesIds } },
        data: { miles: 0, depTime: null, arrTime: null },
      });
    }
    const updated = await prisma.cotacaoPassagemJob.update({
      where: { id: job.id },
      data: { quoteCia: {}, quoteMiles: 0, quoteMilheiroCents: 0, quoteBoardingFeeCents: 0 },
      include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
    });
    return NextResponse.json({ ok: true, job: updated });
  }
  if (body.quoteMiles !== undefined) data.quoteMiles = Math.max(0, Math.trunc(Number(body.quoteMiles) || 0));
  if (body.quoteMilheiroCents !== undefined) {
    data.quoteMilheiroCents = Math.max(0, Math.trunc(Number(body.quoteMilheiroCents) || 0));
  }
  if (body.quoteBoardingFeeCents !== undefined) {
    data.quoteBoardingFeeCents = Math.max(0, Math.trunc(Number(body.quoteBoardingFeeCents) || 0));
  }
  const currentCia = (job.quoteCia && typeof job.quoteCia === "object" ? job.quoteCia : {}) as Record<
    string,
    QuoteCiaCell
  >;
  if (body.quoteCia !== undefined && body.quoteCia && typeof body.quoteCia === "object") {
    const incoming = body.quoteCia as Record<string, QuoteCiaCell>;
    data.quoteCia = Object.fromEntries(
      Object.keys({ ...currentCia, ...incoming }).map((key) => {
        const next = incoming[key] || {};
        const prev = currentCia[key] || {};
        return [
          key,
          {
            milheiroCents: next.milheiroCents ?? prev.milheiroCents ?? 0,
            ida: { ...quoteLeg(prev, "IDA"), ...quoteLeg(next, "IDA") },
            volta: { ...quoteLeg(prev, "VOLTA"), ...quoteLeg(next, "VOLTA") },
          },
        ];
      })
    );
  }
  const cia = String(body.cia || "").toLowerCase();
  if (cia === "latam" || cia === "smiles" || cia === "azul") {
    const miles = Math.max(0, Math.trunc(Number(body.miles) || 0));
    const feeCents = Math.max(0, Math.trunc(Number(body.feeCents) || 0));
    const prev = ((data.quoteCia as Record<string, QuoteCiaCell>) || currentCia)[cia] || {};
    const direction = inferQuoteDirection({
      includeReturn: job.includeReturn,
      origins: job.origins,
      destinations: job.destinations,
      pageOrigin: String(body.origin || ""),
      pageDest: String(body.dest || ""),
      explicit: String(body.direction || ""),
      cell: prev,
    });
    data.quoteCia = {
      ...((data.quoteCia as object) || currentCia),
      [cia]: mergeQuoteLeg(prev, direction, { miles, feeCents }),
    };
  }

  const updated = await prisma.cotacaoPassagemJob.update({
    where: { id: job.id },
    data,
    include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
  });
  return NextResponse.json({ ok: true, job: updated });
}

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const job = await prisma.cotacaoPassagemJob.findFirst({
    where: { id: String(id || ""), team: session.team, ownerId: session.id },
    include: { searches: { orderBy: [{ direction: "asc" }, { date: "asc" }] } },
  });
  if (!job) return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}
