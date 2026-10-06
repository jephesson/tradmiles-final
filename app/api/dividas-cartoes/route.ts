import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { installmentScope, resolveCardDebtCreditor } from "@/lib/card-debt/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  let month = (url.searchParams.get("month") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const now = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Recife",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    month = now;
  }

  try {
    const { creditor, viewOnly } = await resolveCardDebtCreditor(sess);
    if (creditor && sess.role !== "socio") {
      const { ensureCardLedgerDebt } = await import("@/lib/card-debt/sync-person-debt");
      await ensureCardLedgerDebt({
        creditorId: creditor.id,
        creditorName: creditor.name,
        linkedUserId: creditor.ownerId,
      });
    }
    const { start, end } = monthRange(month);
    const scope = installmentScope(sess, creditor?.id || null);

  const [monthRows, allOpen, allPaid, allTotal, monthBuckets] = await Promise.all([
    prisma.cardDebtInstallment.findMany({
      where: { ...scope, dueDate: { gte: start, lt: end } },
      include: { purchase: { select: { id: true, title: true } } },
      orderBy: [{ dueDate: "asc" }, { purchase: { title: "asc" } }, { n: "asc" }],
    }),
    prisma.cardDebtInstallment.aggregate({
      where: { ...scope, status: "OPEN" },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.cardDebtInstallment.aggregate({
      where: { ...scope, status: "PAID" },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.cardDebtInstallment.aggregate({
      where: scope,
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.cardDebtInstallment.findMany({
      where: { ...scope, status: "OPEN" },
      select: { dueDate: true, amountCents: true },
    }),
  ]);

  const byMonth: Record<string, { openCents: number; count: number }> = {};
  for (const row of monthBuckets) {
    const key = isoDate(row.dueDate).slice(0, 7);
    byMonth[key] ||= { openCents: 0, count: 0 };
    byMonth[key].openCents += row.amountCents;
    byMonth[key].count += 1;
  }

  const monthOpen = monthRows.filter((r) => r.status === "OPEN");
  const monthPaid = monthRows.filter((r) => r.status === "PAID");

  return NextResponse.json({
    ok: true,
    data: {
      creditor: {
        id: creditor?.id || "",
        name: creditor?.name || "",
        pixTipo: viewOnly ? null : creditor?.pixTipo || null,
        chavePix: viewOnly ? null : creditor?.chavePix || null,
      },
      viewOnly,
      month,
      installments: monthRows.map((r) => ({
        id: r.id,
        purchaseId: r.purchaseId,
        title: r.purchase.title,
        n: r.n,
        dueDate: isoDate(r.dueDate),
        amountCents: r.amountCents,
        status: r.status,
        paidAt: r.paidAt,
        paidVia: r.paidVia,
      })),
      totals: {
        monthOpenCents: monthOpen.reduce((s, r) => s + r.amountCents, 0),
        monthPaidCents: monthPaid.reduce((s, r) => s + r.amountCents, 0),
        monthCount: monthRows.length,
        monthOpenCount: monthOpen.length,
        allOpenCents: allOpen._sum.amountCents || 0,
        allOpenCount: allOpen._count,
        allPaidCents: allPaid._sum.amountCents || 0,
        allPaidCount: allPaid._count,
        allTotalCents: allTotal._sum.amountCents || 0,
        allCount: allTotal._count,
      },
      openByMonth: Object.entries(byMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, v]) => ({ month: ym, ...v })),
    },
  });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro ao carregar dívida de cartões.";
    console.error("GET /api/dividas-cartoes", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role === "socio") {
    return NextResponse.json({ ok: false, error: "Sócio só visualiza esta tela." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  const amountCents = Math.round(Number(body?.amountCents || 0));
  const count = Math.trunc(Number(body?.count || 0));
  const firstDue = String(body?.firstDueDate || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "Informe a compra." }, { status: 400 });
  if (!(amountCents > 0)) return NextResponse.json({ ok: false, error: "Informe o valor da parcela." }, { status: 400 });
  if (!(count >= 1 && count <= 48)) {
    return NextResponse.json({ ok: false, error: "Quantidade de parcelas inválida." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
    return NextResponse.json({ ok: false, error: "Informe a data da 1ª parcela." }, { status: 400 });
  }

  const { creditor } = await resolveCardDebtCreditor(sess);
  if (!creditor) {
    return NextResponse.json({ ok: false, error: "Nenhuma dívida de cartões vinculada." }, { status: 400 });
  }
  const start = new Date(`${firstDue}T00:00:00.000Z`);
  const purchase = await prisma.cardDebtPurchase.create({
    data: {
      team: sess.team,
      creditorId: creditor.id,
      title,
      installments: {
        create: Array.from({ length: count }, (_, i) => {
          const due = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, start.getUTCDate()));
          return {
            n: i + 1,
            dueDate: due,
            amountCents,
            status: "OPEN",
          };
        }),
      },
    },
  });

  const { addCardPurchaseToPersonDebt } = await import("@/lib/card-debt/sync-person-debt");
  await addCardPurchaseToPersonDebt({
    creditorId: creditor.id,
    creditorName: creditor.name,
    linkedUserId: creditor.ownerId,
    purchaseId: purchase.id,
    title,
    totalCents: amountCents * count,
  });

  return NextResponse.json({ ok: true, data: { id: purchase.id } }, { status: 201 });
}
