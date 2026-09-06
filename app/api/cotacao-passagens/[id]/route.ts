import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

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
  if (body.quoteMiles !== undefined) data.quoteMiles = Math.max(0, Math.trunc(Number(body.quoteMiles) || 0));
  if (body.quoteMilheiroCents !== undefined) {
    data.quoteMilheiroCents = Math.max(0, Math.trunc(Number(body.quoteMilheiroCents) || 0));
  }
  if (body.quoteBoardingFeeCents !== undefined) {
    data.quoteBoardingFeeCents = Math.max(0, Math.trunc(Number(body.quoteBoardingFeeCents) || 0));
  }
  const currentCia = (job.quoteCia && typeof job.quoteCia === "object" ? job.quoteCia : {}) as Record<
    string,
    { miles?: number; feeCents?: number; milheiroCents?: number; depTime?: string; arrTime?: string }
  >;
  if (body.quoteCia !== undefined && body.quoteCia && typeof body.quoteCia === "object") {
    const incoming = body.quoteCia as Record<
      string,
      { miles?: number; feeCents?: number; milheiroCents?: number; depTime?: string; arrTime?: string }
    >;
    data.quoteCia = Object.fromEntries(
      Object.keys({ ...currentCia, ...incoming }).map((key) => {
        const next = incoming[key] || {};
        const prev = currentCia[key] || {};
        return [
          key,
          {
            miles: next.miles ?? prev.miles ?? 0,
            feeCents: next.feeCents ?? prev.feeCents ?? 0,
            milheiroCents: next.milheiroCents ?? prev.milheiroCents ?? 0,
            depTime: next.depTime || prev.depTime,
            arrTime: next.arrTime || prev.arrTime,
          },
        ];
      })
    );
  }
  const cia = String(body.cia || "").toLowerCase();
  if (cia === "latam" || cia === "smiles" || cia === "azul") {
    const miles = Math.max(0, Math.trunc(Number(body.miles) || 0));
    const feeCents = Math.max(0, Math.trunc(Number(body.feeCents) || 0));
    const prev = currentCia[cia] || {};
    data.quoteCia = {
      ...((data.quoteCia as object) || currentCia),
      [cia]: {
        miles,
        feeCents,
        milheiroCents: prev.milheiroCents || 0,
        depTime: prev.depTime,
        arrTime: prev.arrTime,
      },
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
