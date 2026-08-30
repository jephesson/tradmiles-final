import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  build123SearchUrl,
  buildDateList,
  COTACAO_MAX_SEARCHES,
  extractIataList,
  isISODate,
} from "@/lib/cotacao-passagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobInclude = {
  searches: { orderBy: [{ direction: "asc" as const }, { date: "asc" as const }, { originIata: "asc" as const }] },
};

export async function GET(req: Request) {
  const session = await requireSession();
  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") || "").trim();

  const row = id
    ? await prisma.cotacaoPassagemJob.findFirst({
        where: { id, team: session.team, ownerId: session.id },
        include: jobInclude,
      })
    : await prisma.cotacaoPassagemJob.findFirst({
        where: { team: session.team, ownerId: session.id },
        orderBy: { createdAt: "desc" },
        include: jobInclude,
      });

  return NextResponse.json({ ok: true, job: row });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));

  const origins = extractIataList(String(body.origins || ""));
  const destinations = extractIataList(String(body.destinations || ""));
  const outboundFrom = String(body.outboundFrom || "").slice(0, 10);
  const outboundTo = String(body.outboundTo || "").slice(0, 10);
  const outboundDays = Number(body.outboundDays || 1);
  const includeReturn = Boolean(body.includeReturn);
  const returnFrom = String(body.returnFrom || "").slice(0, 10);
  const returnTo = String(body.returnTo || "").slice(0, 10);
  const returnDays = Number(body.returnDays || 1);
  const adults = Math.min(9, Math.max(1, Number(body.adults || 1)));

  if (!origins.length || !destinations.length) {
    return NextResponse.json({ ok: false, error: "Informe origem e destino (IATA)." }, { status: 400 });
  }
  if (!isISODate(outboundFrom)) {
    return NextResponse.json({ ok: false, error: "Informe o período de ida." }, { status: 400 });
  }

  const outboundDates = buildDateList(outboundFrom, outboundTo, outboundDays);
  const returnDates = includeReturn
    ? buildDateList(isISODate(returnFrom) ? returnFrom : outboundFrom, returnTo, returnDays)
    : [];

  type Item = {
    direction: string;
    originIata: string;
    destIata: string;
    date: string;
    url: string;
  };
  const searches: Item[] = [];
  const seen = new Set<string>();

  for (const o of origins) {
    for (const d of destinations) {
      if (o === d) continue;
      for (const date of outboundDates) {
        const key = `IDA|${o}|${d}|${date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        searches.push({
          direction: "IDA",
          originIata: o,
          destIata: d,
          date,
          url: build123SearchUrl(o, d, date, adults),
        });
      }
      for (const date of returnDates) {
        const key = `VOLTA|${d}|${o}|${date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        searches.push({
          direction: "VOLTA",
          originIata: d,
          destIata: o,
          date,
          url: build123SearchUrl(d, o, date, adults),
        });
      }
    }
  }

  if (!searches.length) {
    return NextResponse.json({ ok: false, error: "Nenhuma data/trecho válido." }, { status: 400 });
  }
  if (searches.length > COTACAO_MAX_SEARCHES) {
    return NextResponse.json(
      { ok: false, error: `Máximo de ${COTACAO_MAX_SEARCHES} pesquisas por vez. Reduza aeroportos ou dias.` },
      { status: 400 }
    );
  }

  await prisma.cotacaoPassagemJob.updateMany({
    where: { ownerId: session.id, team: session.team, status: "RUNNING" },
    data: { status: "STOPPED" },
  });

  const job = await prisma.cotacaoPassagemJob.create({
    data: {
      ownerId: session.id,
      team: session.team,
      status: "RUNNING",
      origins: origins.join(","),
      destinations: destinations.join(","),
      adults,
      outboundFrom,
      outboundTo: isISODate(outboundTo) ? outboundTo : null,
      outboundDays: Math.max(1, Math.trunc(outboundDays || 1)),
      includeReturn,
      returnFrom: isISODate(returnFrom) ? returnFrom : null,
      returnTo: isISODate(returnTo) ? returnTo : null,
      returnDays: includeReturn ? Math.max(1, Math.trunc(returnDays || 1)) : null,
      searches: { create: searches },
    },
    include: jobInclude,
  });

  return NextResponse.json({ ok: true, job });
}
