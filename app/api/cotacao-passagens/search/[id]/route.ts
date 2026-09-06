import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { isScoutAirline, parseClock } from "@/lib/cotacao-passagens";
import { enqueueCotacaoFollowups, mergeMilesIntoQuoteCia } from "@/lib/cotacao-followup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const search = await prisma.cotacaoPassagemSearch.findFirst({
    where: { id: String(id || "") },
    include: { job: { select: { id: true, ownerId: true, team: true, status: true } } },
  });
  if (!search || search.job.team !== session.team || search.job.ownerId !== session.id) {
    return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });
  }

  const miles = Math.max(0, Math.trunc(Number(body.miles) || 0));
  const priceCents = Math.trunc(Number(body.priceCents) || 0);
  const ok = Boolean(body.ok) && (priceCents > 0 || miles > 0);
  const depTime = parseClock(String(body.depTime || "")) || null;
  const arrTime = parseClock(String(body.arrTime || "")) || null;
  const durationMin = Math.trunc(Number(body.durationMin) || 0);
  const stopsN = Math.trunc(Number(body.stops));
  const stops = Number.isFinite(stopsN) ? Math.max(0, stopsN) : null;
  const carrier = String(body.carrier || body.airline || "").slice(0, 40);
  const keepAirline = isScoutAirline(search.airline) ? search.airline : String(body.airline || search.airline || "").slice(0, 40);
  const rawBits = [carrier && isScoutAirline(search.airline) ? carrier : "", String(body.rawPrice || "")]
    .map((s) => s.trim())
    .filter(Boolean);
  const updated = await prisma.cotacaoPassagemSearch.update({
    where: { id: search.id },
    data: {
      status: ok ? "OK" : "ERRO",
      priceCents: ok && priceCents > 0 ? priceCents : 0,
      miles: ok && miles > 0 ? miles : 0,
      airline: keepAirline,
      rawPrice: rawBits.join(" · ").slice(0, 200) || null,
      error: ok ? null : String(body.error || "Não achei o preço à vista.").slice(0, 400),
      depTime: ok ? depTime : null,
      arrTime: ok ? arrTime : null,
      durationMin: ok && durationMin > 0 ? durationMin : null,
      stops: ok ? stops : null,
      finishedAt: new Date(),
    },
  });

  if (ok && miles > 0) {
    await mergeMilesIntoQuoteCia(
      search.jobId,
      updated.airline,
      miles,
      search.direction === "VOLTA" ? "VOLTA" : "IDA"
    );
  }

  if (search.job.status === "RUNNING") {
    await enqueueCotacaoFollowups(search.jobId);
  }

  return NextResponse.json({ ok: true, search: updated });
}
