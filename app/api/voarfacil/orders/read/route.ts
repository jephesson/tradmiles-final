import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { parseVoarFacilOrderHtml } from "@/lib/voarfacil/parseOrderHtml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Cola o link do pedido Voar Fácil: lê a página (voos, passageiros por faixa, limites) e guarda o pedido. */
export async function POST(req: Request) {
  let sess;
  try {
    sess = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }
  const body = await req.json().catch(() => ({}));
  const raw = String(body?.url || "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return bad("Cole o link completo do pedido (https://emissao-externa.voarfacil.net/…).");
  }
  if (url.protocol !== "https:" || url.hostname !== "emissao-externa.voarfacil.net") {
    return bad("O link precisa ser do emissao-externa.voarfacil.net.");
  }

  let html = "";
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(url.toString(), {
      signal: ac.signal,
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (TradeMiles)", Accept: "text/html" },
    }).finally(() => clearTimeout(t));
    html = await res.text();
  } catch {
    return bad("Não consegui abrir o link do Voar Fácil. Tente de novo.", 502);
  }
  if (/Link inv[aá]lido ou expirado/i.test(html)) {
    return bad("Link inválido ou expirado. Peça um link novo ao Voar Fácil.");
  }

  const data = parseVoarFacilOrderHtml(html, url.toString());
  if (!data) return bad("Não achei voos e passageiros nesta página.");

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

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      code: row.code,
      pedido: row.pedido,
      url: row.url,
      data,
      saleId: row.saleId,
      hasFill: Boolean(row.fill),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
