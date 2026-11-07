import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import type { VoarFacilOrderData } from "@/lib/voarfacil/order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function sanitize(raw: any): VoarFacilOrderData | null {
  const code = String(raw?.code || "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(code)) return null;
  const url = String(raw?.url || "");
  if (!/^https:\/\/emissao-externa\.voarfacil\.net\//.test(url)) return null;
  const s = (v: any, n = 80) => String(v ?? "").trim().slice(0, n);
  const passengers = (Array.isArray(raw?.passengers) ? raw.passengers : []).slice(0, 9).map((p: any) => ({
    firstName: s(p?.firstName),
    lastName: s(p?.lastName),
    faixa: s(p?.faixa, 20),
    birth: s(p?.birth, 10),
    sex: s(p?.sex, 2),
    document: s(p?.document, 20),
  }));
  const legs = (Array.isArray(raw?.legs) ? raw.legs : []).slice(0, 2).map((l: any) => ({
    direction: l?.direction === "VOLTA" ? "VOLTA" : "IDA",
    from: s(l?.from, 3),
    to: s(l?.to, 3),
    date: s(l?.date, 10),
    miles: Math.max(0, Math.trunc(Number(l?.miles) || 0)),
    segments: (Array.isArray(l?.segments) ? l.segments : []).slice(0, 6).map((g: any) => ({
      flight: s(g?.flight, 8),
      date: s(g?.date, 10),
      from: s(g?.from, 3),
      to: s(g?.to, 3),
    })),
  }));
  const milesByFaixa: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw?.milesByFaixa || {})) {
    milesByFaixa[s(k, 30)] = Math.max(0, Math.trunc(Number(v) || 0));
  }
  return {
    code,
    pedido: s(raw?.pedido, 20),
    url: url.slice(0, 500),
    title: s(raw?.title, 120),
    limitTaxCents: Math.max(0, Math.trunc(Number(raw?.limitTaxCents) || 0)),
    limitMiles: Math.max(0, Math.trunc(Number(raw?.limitMiles) || 0)),
    trip: legs.some((l: any) => l.direction === "VOLTA") ? "IDA_VOLTA" : "IDA",
    legs,
    passengers,
    counts: {
      adt: Math.max(0, Number(raw?.counts?.adt) || 0),
      chd: Math.max(0, Number(raw?.counts?.chd) || 0),
      inf: Math.max(0, Number(raw?.counts?.inf) || 0),
    },
    milesByFaixa,
  };
}

/** Lista os pedidos lidos nos últimos dias (para escolher na emissão). */
export async function GET(req: Request) {
  let sess;
  try {
    sess = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }
  const since = new Date(Date.now() - 5 * 86400000);
  const rows = await prisma.voarFacilOrder.findMany({
    where: { team: sess.team, updatedAt: { gte: since } },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      code: r.code,
      pedido: r.pedido,
      url: r.url,
      data: r.data,
      saleId: r.saleId,
      hasFill: Boolean(r.fill),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

/** Extensão envia o pedido lido da página do Voar Fácil. */
export async function POST(req: Request) {
  let sess;
  try {
    sess = requireSession(req);
  } catch {
    return bad("Faça login no TradeMiles nesta janela (www.trademiles.com.br).", 401);
  }
  const body = await req.json().catch(() => ({}));
  const data = sanitize(body?.order);
  if (!data) return bad("Pedido inválido.");
  if (!data.passengers.length || !data.legs.length) return bad("Pedido sem voos ou passageiros.");

  const row = await prisma.voarFacilOrder.upsert({
    where: { team_code: { team: sess.team, code: data.code } },
    create: {
      team: sess.team,
      createdById: sess.userId,
      code: data.code,
      pedido: data.pedido || null,
      url: data.url,
      data: data as any,
    },
    update: { pedido: data.pedido || null, url: data.url, data: data as any },
  });
  return NextResponse.json({ ok: true, data: { id: row.id, hasFill: Boolean(row.fill) } });
}
