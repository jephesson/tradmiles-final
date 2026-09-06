import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { ciaKeyFromMilesAirline, durationMinFromClocks, parseClock } from "@/lib/cotacao-passagens";
import { interpretMilesSnippet } from "@/lib/cotacao-interpret-miles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));
  const cia = String(body.cia || "").toLowerCase();
  const snippet = String(body.snippet || "");
  const jobId = String(body.jobId || "").trim();

  if (cia !== "latam" && cia !== "smiles" && cia !== "azul") {
    return NextResponse.json({ ok: false, error: "Cia inválida." }, { status: 400 });
  }
  if (snippet.replace(/\s+/g, " ").trim().length < 8) {
    return NextResponse.json({ ok: false, error: "Selecione o trecho do voo na página." }, { status: 400 });
  }

  const parsed = await interpretMilesSnippet(snippet, cia);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "A IA não achou milhas nesse recorte. Selecione milhas e taxa juntos." },
      { status: 422 }
    );
  }

  const job = jobId
    ? await prisma.cotacaoPassagemJob.findFirst({
        where: { id: jobId, team: session.team, ownerId: session.id },
      })
    : await prisma.cotacaoPassagemJob.findFirst({
        where: { team: session.team, ownerId: session.id },
        orderBy: { createdAt: "desc" },
      });

  if (!job) {
    return NextResponse.json(
      { ok: false, error: "Abra a cotação no TradeMiles para gravar milhas e taxa." },
      { status: 404 }
    );
  }

  const depTime = parseClock(parsed.depTime) || null;
  const arrTime = parseClock(parsed.arrTime) || null;
  const durationMin = durationMinFromClocks(depTime, arrTime);
  const current = (job.quoteCia && typeof job.quoteCia === "object" ? job.quoteCia : {}) as Record<
    string,
    { miles?: number; feeCents?: number; milheiroCents?: number; depTime?: string; arrTime?: string }
  >;
  const prev = current[cia] || {};
  await prisma.cotacaoPassagemJob.update({
    where: { id: job.id },
    data: {
      quoteCia: {
        ...current,
        [cia]: {
          miles: parsed.miles,
          feeCents: parsed.feeCents,
          milheiroCents: prev.milheiroCents || 0,
          depTime: depTime || prev.depTime,
          arrTime: arrTime || prev.arrTime,
        },
      },
    },
  });

  const searches = await prisma.cotacaoPassagemSearch.findMany({ where: { jobId: job.id } });
  const milesRow = searches.find(
    (s) => s.direction === "IDA" && ciaKeyFromMilesAirline(s.airline) === cia
  );
  if (milesRow && depTime && arrTime) {
    await prisma.cotacaoPassagemSearch.update({
      where: { id: milesRow.id },
      data: { depTime, arrTime, durationMin: durationMin || milesRow.durationMin },
    });
  }

  return NextResponse.json({
    ok: true,
    miles: parsed.miles,
    feeCents: parsed.feeCents,
    depTime: parsed.depTime,
    arrTime: parsed.arrTime,
  });
}
