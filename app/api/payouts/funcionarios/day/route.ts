import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
};

/* =========================
   Session (tm.session)
========================= */
function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies(); // ✅ Next 16: cookies() é Promise
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

/* =========================
   Utils
========================= */
function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}
function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

/**
 * ✅ IMPORTANTE:
 * Seu `sale.date` foi salvo como Date "naive" (new Date(y,m,d)) em ambiente UTC (Vercel),
 * então o mais consistente pra NÃO perder vendas é filtrar por DIA em UTC.
 */
function dayBoundsUTC(date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function pointsValueCentsFallback(points: number, milheiroCents: number) {
  const denom = (points ?? 0) / 1000;
  if (denom <= 0) return 0;
  return Math.round(denom * (milheiroCents ?? 0));
}

function commission1Fallback(pointsValueCents: number) {
  return Math.round((pointsValueCents ?? 0) * 0.01);
}

/** 8% só em cima do positivo (se negativo, não “vira crédito”) */
function tax8OnPositive(cents: number) {
  const base = Math.max(0, safeInt(cents, 0));
  return Math.round(base * 0.08);
}

function milheiroFrom(points: number, pointsValueCents: number) {
  const pts = safeInt(points, 0);
  const cents = safeInt(pointsValueCents, 0);
  if (!pts || !cents) return 0;
  return Math.round((cents * 1000) / pts);
}

function bonus30(points: number, milheiroCents: number, metaMilheiroCents: number) {
  const pts = safeInt(points, 0);
  const mil = safeInt(milheiroCents, 0);
  const meta = safeInt(metaMilheiroCents, 0);
  if (!pts || !mil || !meta) return 0;

  const diff = mil - meta;
  if (diff <= 0) return 0;

  const excedenteCents = Math.round((pts * diff) / 1000);
  return Math.round(excedenteCents * 0.3);
}

type RateioItem = { payeeId: string; bps: number };
function splitByBps(totalCents: number, items: RateioItem[]) {
  const total = safeInt(totalCents, 0);
  if (!items.length) return [];

  const raw = items.map((it) => Math.round((total * safeInt(it.bps, 0)) / 10000));
  const sum = raw.reduce((a, b) => a + b, 0);
  const diff = total - sum;

  if (diff !== 0) raw[raw.length - 1] = raw[raw.length - 1] + diff;
  return raw;
}

/* =========================
   GET /api/payouts/funcionarios/day?date=YYYY-MM-DD
   ✅ READ ONLY:
   - Não calcula C1/C2/C3
   - Não apaga payout
   - Não upsert
   - Só lê do banco e devolve TODOS os funcionários
========================= */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session?.id || !session?.team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const url = new URL(req.url);
    const date = String(url.searchParams.get("date") || "").trim();

    if (!date || !isISODate(date)) {
      return NextResponse.json(
        { ok: false, error: "date obrigatório (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Mantém aqui só pra não quebrar (e pra teu compute usar igual).
    // No DAY read-only a gente não usa start/end.
    dayBoundsUTC(date);

    // 1) todos usuários do time
    const users = await prisma.user.findMany({
      where: { team: session.team, role: { in: ["admin", "staff"] } },
      select: { id: true, name: true, login: true },
      orderBy: [{ name: "asc" }],
    });

    // 2) lê payouts do dia (com joins)
    const payouts = await prisma.employeePayout.findMany({
      where: { team: session.team, date },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    const byUserId = new Map(payouts.map((p) => [p.userId, p]));

    // 3) garante retorno de TODO MUNDO (mesmo sem movimento)
    const rows = users.map((u) => {
      const p = byUserId.get(u.id);

      if (p) {
        return {
          id: p.id,
          team: p.team,
          date: p.date,
          userId: p.userId,

          grossProfitCents: safeInt(p.grossProfitCents, 0),
          tax7Cents: safeInt(p.tax7Cents, 0),
          feeCents: safeInt(p.feeCents, 0),
          netPayCents: safeInt(p.netPayCents, 0),

          breakdown: (p.breakdown as any) ?? null,

          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          paidById: p.paidById ?? null,

          user: p.user,
          paidBy: p.paidBy ?? null,
        };
      }

      return {
        id: `missing:${session.team}:${date}:${u.id}`,
        team: session.team,
        date,
        userId: u.id,

        grossProfitCents: 0,
        tax7Cents: 0,
        feeCents: 0,
        netPayCents: 0,

        breakdown: {
          commission1Cents: 0,
          commission2Cents: 0,
          commission3RateioCents: 0,
          salesCount: 0,
          purchasesRateioCount: 0,
          taxPercent: 8,
        },

        paidAt: null,
        paidById: null,

        user: u,
        paidBy: null,
      };
    });

    // 4) totais
    const totals = rows.reduce(
      (acc, r) => {
        acc.gross += safeInt(r.grossProfitCents, 0);
        acc.tax += safeInt(r.tax7Cents, 0);
        acc.fee += safeInt(r.feeCents, 0);
        acc.net += safeInt(r.netPayCents, 0);

        if (r.paidById || r.paidAt) acc.paid += safeInt(r.netPayCents, 0);

        return acc;
      },
      { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
    );

    totals.pending = totals.net - totals.paid;

    return NextResponse.json({
      ok: true,
      date,
      rows,
      totals,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
