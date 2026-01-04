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

function clampInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/**
 * ✅ IMPORTANTE:
 * Seu `sale.date` hoje foi salvo como Date "naive" (new Date(y,m,d)) em ambiente UTC (Vercel),
 * então o mais consistente pra NÃO perder vendas é filtrar por DIA em UTC.
 * (Isso faz bater com o que já tá gravado hoje.)
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

function tax8(cents: number) {
  return Math.round((cents ?? 0) * 0.08);
}

/* =========================
   GET /api/payouts/funcionarios/day?date=YYYY-MM-DD
   - Gera/atualiza payout do dia (C1) com base em Sale
   - Retorna TODOS os funcionários do time (mesmo sem movimento)
========================= */
export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id || !session?.team) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = String(url.searchParams.get("date") || "").trim();

  if (!date || !isISODate(date)) {
    return NextResponse.json({ ok: false, error: "date obrigatório (YYYY-MM-DD)" }, { status: 400 });
  }

  const { start, end } = dayBoundsUTC(date);

  // 1) todos usuários do time
  const users = await prisma.user.findMany({
    where: { team: session.team, role: { in: ["admin", "staff"] } },
    select: { id: true, name: true, login: true },
    orderBy: [{ name: "asc" }],
  });

  // 2) payouts existentes do dia (pra preservar PAGO)
  const existingPayouts = await prisma.employeePayout.findMany({
    where: { team: session.team, date },
    select: {
      id: true,
      userId: true,
      paidById: true,
      paidAt: true,
    },
  });
  const existingByUserId = new Map(existingPayouts.map((p) => [p.userId, p]));

  // 3) busca vendas do dia e agrega C1 + taxa por seller
  //    ✅ conta PENDING + PAID; ignora só CANCELED
  const sales = await prisma.sale.findMany({
    where: {
      date: { gte: start, lt: end },
      cedente: { owner: { team: session.team } },
      paymentStatus: { not: "CANCELED" },
    },
    select: {
      id: true,
      date: true,
      sellerId: true,
      points: true,
      milheiroCents: true,
      pointsValueCents: true,
      commissionCents: true,
      embarqueFeeCents: true,
    },
  });

  type Agg = { commission1Cents: number; feeCents: number; salesCount: number };
  const byUser: Record<string, Agg> = {};

  for (const s of sales) {
    const sellerId = s.sellerId;
    if (!sellerId) continue;

    const pv = s.pointsValueCents ?? pointsValueCentsFallback(s.points, s.milheiroCents);
    const c1 = s.commissionCents ?? commission1Fallback(pv);
    const fee = s.embarqueFeeCents ?? 0;

    const a = (byUser[sellerId] ||= { commission1Cents: 0, feeCents: 0, salesCount: 0 });
    a.commission1Cents += c1 || 0;
    a.feeCents += fee || 0;
    a.salesCount += 1;
  }

  const computedUserIds = Object.keys(byUser);

  // 4) remove payouts "lixo" (sem movimento) que ainda não foram pagos
  await prisma.employeePayout.deleteMany({
    where: {
      team: session.team,
      date,
      paidById: null,
      userId: { notIn: computedUserIds.length ? computedUserIds : ["__none__"] },
    },
  });

  // 5) upsert payout (somente C1 por enquanto), preservando se já estiver PAGO
  for (const userId of computedUserIds) {
    const agg = byUser[userId];
    const existing = existingByUserId.get(userId);

    // ✅ se já está pago, não recalcula pra não mudar histórico
    if (existing?.paidById) continue;

    const gross = agg.commission1Cents || 0; // C1 por enquanto
    const tax = tax8(gross);
    const net = gross - tax + (agg.feeCents || 0);

    await prisma.employeePayout.upsert({
      where: { team_date_userId: { team: session.team, date, userId } },
      create: {
        team: session.team,
        date,
        userId,
        grossProfitCents: gross,
        tax7Cents: tax, // nome legado
        feeCents: agg.feeCents || 0,
        netPayCents: net,
        breakdown: {
          commission1Cents: gross,
          commission2Cents: 0,
          commission3RateioCents: 0,
          salesCount: agg.salesCount || 0,
          taxPercent: 8,
        },
      },
      update: {
        grossProfitCents: gross,
        tax7Cents: tax,
        feeCents: agg.feeCents || 0,
        netPayCents: net,
        breakdown: {
          commission1Cents: gross,
          commission2Cents: 0,
          commission3RateioCents: 0,
          salesCount: agg.salesCount || 0,
          taxPercent: 8,
        },
        // ✅ não mexe em paidAt/paidById aqui
      },
    });
  }

  // 6) lê payouts do dia (com joins)
  const payouts = await prisma.employeePayout.findMany({
    where: { team: session.team, date },
    include: {
      user: { select: { id: true, name: true, login: true } },
      paidBy: { select: { id: true, name: true } },
    },
  });

  const byUserId = new Map(payouts.map((p) => [p.userId, p]));

  // 7) garante que volte TODO MUNDO (mesmo sem movimento)
  const rows = users.map((u) => {
    const p = byUserId.get(u.id);

    if (p) {
      return {
        id: p.id,
        team: p.team,
        date: p.date,
        userId: p.userId,
        grossProfitCents: p.grossProfitCents,
        tax7Cents: p.tax7Cents,
        feeCents: p.feeCents,
        netPayCents: p.netPayCents,
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
        taxPercent: 8,
      },
      paidAt: null,
      paidById: null,
      user: u,
      paidBy: null,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += r.grossProfitCents || 0;
      acc.tax += r.tax7Cents || 0;
      acc.fee += r.feeCents || 0;
      acc.net += r.netPayCents || 0;
      if (r.paidById || r.paidAt) acc.paid += r.netPayCents || 0;
      return acc;
    },
    { gross: 0, tax: 0, fee: 0, net: 0, paid: 0, pending: 0 }
  );

  totals.pending = totals.net - totals.paid;

  return NextResponse.json({ ok: true, date, rows, totals });
}
