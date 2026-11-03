import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { addMonthsISO, isoDateUTC } from "@/lib/card-debt/dates";
import { resolveCardDebtCreditor } from "@/lib/card-debt/scope";
import { adjustCardLedgerTotal } from "@/lib/card-debt/sync-person-debt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(purchase: {
  id: string;
  title: string;
  createdAt: Date;
  installments: {
    id: string;
    n: number;
    dueDate: Date;
    amountCents: number;
    status: string;
  }[];
}) {
  const installments = [...purchase.installments].sort((a, b) => a.n - b.n);
  const first = installments[0];
  return {
    id: purchase.id,
    title: purchase.title,
    addedAt: isoDateUTC(purchase.createdAt),
    firstDueDate: first ? isoDateUTC(first.dueDate) : "",
    count: installments.length,
    amountCents: first?.amountCents || 0,
    installments: installments.map((r) => ({
      id: r.id,
      n: r.n,
      dueDate: isoDateUTC(r.dueDate),
      amountCents: r.amountCents,
      status: r.status,
    })),
  };
}

async function loadPurchase(opts: { id: string; team: string; creditorId: string | null; socio: boolean }) {
  return prisma.cardDebtPurchase.findFirst({
    where: {
      id: opts.id,
      team: opts.team,
      ...(opts.socio && opts.creditorId ? { creditorId: opts.creditorId } : {}),
      ...(opts.socio && !opts.creditorId ? { id: "__none__" } : {}),
    },
    include: {
      creditor: { select: { id: true } },
      installments: { orderBy: { n: "asc" } },
    },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { creditor } = await resolveCardDebtCreditor(sess);
  const purchase = await loadPurchase({
    id,
    team: sess.team,
    creditorId: creditor?.id || null,
    socio: sess.role === "socio",
  });
  if (!purchase) return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true, data: serialize(purchase) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role === "socio") {
    return NextResponse.json({ ok: false, error: "Sócio só visualiza esta tela." }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { creditor } = await resolveCardDebtCreditor(sess);
  const purchase = await loadPurchase({
    id,
    team: sess.team,
    creditorId: creditor?.id || null,
    socio: false,
  });
  if (!purchase) return NextResponse.json({ ok: false, error: "Compra não encontrada." }, { status: 404 });

  const current = [...purchase.installments].sort((a, b) => a.n - b.n);
  const title =
    body?.title !== undefined ? String(body.title || "").trim() : purchase.title;
  const firstDue =
    body?.firstDueDate !== undefined
      ? String(body.firstDueDate || "").trim()
      : current[0]
        ? isoDateUTC(current[0].dueDate)
        : "";
  const amountCents =
    body?.amountCents !== undefined
      ? Math.round(Number(body.amountCents || 0))
      : current[0]?.amountCents || 0;
  const count =
    body?.count !== undefined ? Math.trunc(Number(body.count || 0)) : current.length;

  if (!title) return NextResponse.json({ ok: false, error: "Informe a compra." }, { status: 400 });
  if (!(amountCents > 0)) {
    return NextResponse.json({ ok: false, error: "Informe o valor da parcela." }, { status: 400 });
  }
  if (!(count >= 1 && count <= 48)) {
    return NextResponse.json({ ok: false, error: "Quantidade de parcelas inválida." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
    return NextResponse.json({ ok: false, error: "Informe a data da 1ª parcela." }, { status: 400 });
  }

  const trailing = current.filter((r) => r.n > count);
  if (trailing.some((r) => r.status === "PAID")) {
    return NextResponse.json(
      { ok: false, error: "Não dá para reduzir: há parcela paga depois dessa quantidade." },
      { status: 400 }
    );
  }

  const oldTotal = current.reduce((s, r) => s + r.amountCents, 0);

  await prisma.$transaction(async (tx) => {
    if (trailing.length) {
      await tx.cardDebtInstallment.deleteMany({
        where: { id: { in: trailing.map((r) => r.id) } },
      });
    }

    const keep = current.filter((r) => r.n <= count);
    for (const row of keep) {
      await tx.cardDebtInstallment.update({
        where: { id: row.id },
        data: {
          dueDate: new Date(`${addMonthsISO(firstDue, row.n - 1)}T00:00:00.000Z`),
          amountCents: row.status === "OPEN" ? amountCents : row.amountCents,
        },
      });
    }

    const maxN = keep.length ? Math.max(...keep.map((r) => r.n)) : 0;
    if (count > maxN) {
      await tx.cardDebtInstallment.createMany({
        data: Array.from({ length: count - maxN }, (_, i) => {
          const n = maxN + i + 1;
          return {
            purchaseId: purchase.id,
            n,
            dueDate: new Date(`${addMonthsISO(firstDue, n - 1)}T00:00:00.000Z`),
            amountCents,
            status: "OPEN",
          };
        }),
      });
    }

    await tx.cardDebtPurchase.update({
      where: { id: purchase.id },
      data: { title },
    });
  });

  const updated = await prisma.cardDebtInstallment.findMany({
    where: { purchaseId: purchase.id },
    select: { amountCents: true },
  });
  const newTotal = updated.reduce((s, r) => s + r.amountCents, 0);
  await adjustCardLedgerTotal({
    creditorId: purchase.creditorId,
    deltaCents: newTotal - oldTotal,
  });

  const fresh = await loadPurchase({
    id: purchase.id,
    team: sess.team,
    creditorId: creditor?.id || null,
    socio: false,
  });
  return NextResponse.json({ ok: true, data: fresh ? serialize(fresh) : { id: purchase.id } });
}
