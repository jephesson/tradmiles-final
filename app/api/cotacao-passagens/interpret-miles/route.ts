import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  ciaKeyFromMilesAirline,
  durationMinFromClocks,
  extractIataList,
  isScoutAirline,
  parseClock,
} from "@/lib/cotacao-passagens";
import { inferQuoteDirection, mergeQuoteLeg, quoteTotals, type QuoteCiaCell } from "@/lib/cotacao-quote-cia";
import { interpretMilesSnippet } from "@/lib/cotacao-interpret-miles";
import { interpretCashSnippet } from "@/lib/cotacao-interpret-cash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CASH_CIA: Record<string, "LATAM" | "AZUL" | "GOL"> = {
  latam: "LATAM",
  azul: "AZUL",
  gol: "GOL",
};

function legMeta(
  job: {
    origins: string;
    destinations: string;
    outboundFrom: string;
    returnFrom: string | null;
    includeReturn: boolean;
  },
  direction: "IDA" | "VOLTA",
  searches: Array<{
    direction: string;
    originIata: string;
    destIata: string;
    date: string;
    airline: string;
  }>
) {
  const scout =
    searches.find((s) => s.direction === direction && isScoutAirline(s.airline)) ||
    searches.find((s) => s.direction === direction);
  if (scout) {
    return { originIata: scout.originIata, destIata: scout.destIata, date: scout.date };
  }
  const origins = extractIataList(job.origins);
  const dests = extractIataList(job.destinations);
  if (direction === "VOLTA") {
    return {
      originIata: dests[0] || "",
      destIata: origins[0] || "",
      date: job.returnFrom || job.outboundFrom,
    };
  }
  return {
    originIata: origins[0] || "",
    destIata: dests[0] || "",
    date: job.outboundFrom,
  };
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));
  const cia = String(body.cia || "").toLowerCase();
  const snippet = String(body.snippet || "");
  const jobId = String(body.jobId || "").trim();
  const mode = String(body.mode || "").toLowerCase() === "cash" ? "cash" : "miles";

  if (mode === "cash") {
    if (!CASH_CIA[cia]) {
      return NextResponse.json({ ok: false, error: "Cia inválida para à vista." }, { status: 400 });
    }
  } else if (cia !== "latam" && cia !== "smiles" && cia !== "azul") {
    return NextResponse.json({ ok: false, error: "Cia inválida." }, { status: 400 });
  }
  if (snippet.replace(/\s+/g, " ").trim().length < 8) {
    return NextResponse.json({ ok: false, error: "Selecione o trecho do voo na página." }, { status: 400 });
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
      { ok: false, error: "Abra a cotação no TradeMiles para gravar o voo." },
      { status: 404 }
    );
  }

  if (mode === "cash") {
    const parsed = await interpretCashSnippet(snippet);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "Não achei o preço em reais nesse recorte. Selecione tarifa e horários juntos." },
        { status: 422 }
      );
    }
    const searches = await prisma.cotacaoPassagemSearch.findMany({ where: { jobId: job.id } });
    const direction = inferQuoteDirection({
      includeReturn: job.includeReturn,
      origins: job.origins,
      destinations: job.destinations,
      pageOrigin: String(body.origin || ""),
      pageDest: String(body.dest || ""),
      explicit: String(body.direction || ""),
    });
    const meta = legMeta(job, direction, searches);
    if (!meta.originIata || !meta.destIata || !meta.date) {
      return NextResponse.json({ ok: false, error: "Cotação sem trecho para gravar o à vista." }, { status: 400 });
    }
    const airline = CASH_CIA[cia];
    const depTime = parseClock(parsed.depTime) || null;
    const arrTime = parseClock(parsed.arrTime) || null;
    const durationMin = durationMinFromClocks(depTime, arrTime);
    const url = String(body.pageUrl || "").slice(0, 2000) || `https://${cia}`;
    const rawPrice = (parsed.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    await prisma.cotacaoPassagemSearch.upsert({
      where: {
        jobId_direction_originIata_destIata_date_airline: {
          jobId: job.id,
          direction,
          originIata: meta.originIata,
          destIata: meta.destIata,
          date: meta.date,
          airline,
        },
      },
      create: {
        jobId: job.id,
        direction,
        originIata: meta.originIata,
        destIata: meta.destIata,
        date: meta.date,
        url,
        airline,
        status: "OK",
        priceCents: parsed.priceCents,
        miles: 0,
        rawPrice,
        depTime,
        arrTime,
        durationMin: durationMin || null,
        stops: parsed.stops,
        finishedAt: new Date(),
      },
      update: {
        url,
        status: "OK",
        priceCents: parsed.priceCents,
        miles: 0,
        rawPrice,
        error: null,
        depTime,
        arrTime,
        durationMin: durationMin || null,
        stops: parsed.stops,
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      mode: "cash",
      direction,
      priceCents: parsed.priceCents,
      depTime: parsed.depTime,
      arrTime: parsed.arrTime,
      stops: parsed.stops,
    });
  }

  const parsed = await interpretMilesSnippet(snippet, cia);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "A IA não achou milhas nesse recorte. Selecione milhas e taxa juntos." },
      { status: 422 }
    );
  }

  const depTime = parseClock(parsed.depTime) || null;
  const arrTime = parseClock(parsed.arrTime) || null;
  const durationMin = durationMinFromClocks(depTime, arrTime);
  const current = (job.quoteCia && typeof job.quoteCia === "object" ? job.quoteCia : {}) as Record<
    string,
    QuoteCiaCell
  >;
  const prev = current[cia] || {};
  const direction = inferQuoteDirection({
    includeReturn: job.includeReturn,
    origins: job.origins,
    destinations: job.destinations,
    pageOrigin: String(body.origin || ""),
    pageDest: String(body.dest || ""),
    explicit: String(body.direction || ""),
    cell: prev,
  });
  const nextCell = mergeQuoteLeg(prev, direction, {
    miles: parsed.miles,
    feeCents: parsed.feeCents,
    depTime: depTime || undefined,
    arrTime: arrTime || undefined,
  });
  await prisma.cotacaoPassagemJob.update({
    where: { id: job.id },
    data: {
      quoteCia: {
        ...current,
        [cia]: nextCell,
      },
    },
  });

  const searches = await prisma.cotacaoPassagemSearch.findMany({ where: { jobId: job.id } });
  const milesRow = searches.find(
    (s) => s.direction === direction && ciaKeyFromMilesAirline(s.airline) === cia
  );
  if (milesRow && depTime && arrTime) {
    await prisma.cotacaoPassagemSearch.update({
      where: { id: milesRow.id },
      data: { depTime, arrTime, durationMin: durationMin || milesRow.durationMin, miles: parsed.miles },
    });
  }

  const totals = quoteTotals(nextCell, job.includeReturn);
  const needOther = job.includeReturn && !totals.ready;
  return NextResponse.json({
    ok: true,
    mode: "miles",
    direction,
    miles: parsed.miles,
    feeCents: parsed.feeCents,
    depTime: parsed.depTime,
    arrTime: parsed.arrTime,
    needOtherLeg: needOther,
    otherLeg: direction === "IDA" ? "VOLTA" : "IDA",
  });
}
