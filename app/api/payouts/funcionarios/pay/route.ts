import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { todayISORecife } from "@/lib/payouts/employeePayouts";
import { employeePayableCents } from "@/lib/payouts/employeePayable";
import { interConfigured } from "@/lib/inter/config";
import { payEmployeePayoutViaInter } from "@/lib/inter/pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isISODate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((v || "").trim());
}

function readBasis(breakdown: unknown): "SALE_DATE" | "PURCHASE_FINALIZED" {
  const basis = (breakdown as { basis?: unknown } | null)?.basis;
  return basis === "PURCHASE_FINALIZED" ? "PURCHASE_FINALIZED" : "SALE_DATE";
}

async function recomputeDay(req: Request, date: string, breakdown: unknown) {
  const computeUrl = new URL("/api/payouts/funcionarios/compute", req.url);
  const recompute = await fetch(computeUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") || "",
    },
    body: JSON.stringify({
      date,
      basis: readBasis(breakdown),
      force: false,
    }),
  });

  if (!recompute.ok) {
    const payload = (await recompute.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false as const,
      error: payload?.error || "Falha ao recalcular o dia antes de pagar.",
      status: recompute.status || 500,
    };
  }

  return { ok: true as const };
}

async function markLocalPaid(team: string, date: string, userId: string, meId: string) {
  return prisma.employeePayout.updateMany({
    where: { team, date, userId, paidById: null },
    data: { paidById: meId, paidAt: new Date() },
  });
}

async function payOne(opts: {
  team: string;
  date: string;
  userId: string;
  meId: string;
}) {
  const payout = await prisma.employeePayout.findFirst({
    where: { team: opts.team, date: opts.date, userId: opts.userId },
  });
  if (!payout) return { ok: false as const, error: "Payout não encontrado.", status: 404 };
  if (payout.paidById) {
    return { ok: true as const, paid: true, via: "local" as const, awaitingApproval: false };
  }

  const amountCents = await employeePayableCents({
    team: opts.team,
    date: opts.date,
    userId: opts.userId,
    netPayCents: payout.netPayCents,
    discountCents: payout.discountCents,
  });

  const inter = await payEmployeePayoutViaInter({
    team: opts.team,
    payoutId: payout.id,
    userId: opts.userId,
    date: opts.date,
    amountCents,
    requestedById: opts.meId,
  });

  if (inter.via === "local" || inter.paid) {
    await markLocalPaid(opts.team, opts.date, opts.userId, opts.meId);
  }

  return { ok: true as const, ...inter };
}

export async function POST(req: Request) {
  try {
    const sess = await requireSession();
    const team = String((sess as { team?: string })?.team || "");
    const meId = String((sess as { id?: string })?.id || "");
    const role = String((sess as { role?: string })?.role || "");

    if (!team || !meId) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    if (role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão para pagar." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const date = String(body?.date || "").slice(0, 10);
    const userId = String(body?.userId || "");
    const payAll = Boolean(body?.payAll);

    if (!date) {
      return NextResponse.json({ ok: false, error: "date obrigatório" }, { status: 400 });
    }
    if (!isISODate(date)) {
      return NextResponse.json({ ok: false, error: "date inválido (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!payAll && !userId) {
      return NextResponse.json({ ok: false, error: "date e userId obrigatórios" }, { status: 400 });
    }

    const today = todayISORecife();
    if (date >= today) {
      return NextResponse.json(
        { ok: false, error: "Só paga dia fechado (apenas dias anteriores a hoje)." },
        { status: 400 }
      );
    }

    if (payAll) {
      const pending = await prisma.employeePayout.findMany({
        where: { team, date, paidById: null },
        select: { id: true, userId: true, breakdown: true },
      });

      if (pending.length) {
        const recomputed = await recomputeDay(req, date, pending[0].breakdown);
        if (!recomputed.ok) {
          return NextResponse.json(
            { ok: false, error: recomputed.error },
            { status: recomputed.status }
          );
        }
      }

      if (!interConfigured()) {
        const res = await prisma.employeePayout.updateMany({
          where: { team, date, paidById: null },
          data: { paidById: meId, paidAt: new Date() },
        });
        return NextResponse.json({
          ok: true,
          via: "local",
          paidCount: res.count,
          changed: res.count > 0,
        });
      }

      let paidCount = 0;
      let awaiting = 0;
      const errors: string[] = [];
      for (const p of pending) {
        try {
          const out = await payOne({ team, date, userId: p.userId, meId });
          if (!out.ok) errors.push(out.error);
          else if (out.paid) paidCount += 1;
          else if (out.awaitingApproval) awaiting += 1;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      return NextResponse.json({
        ok: errors.length === 0,
        via: "inter",
        paidCount,
        awaitingCount: awaiting,
        changed: paidCount + awaiting > 0,
        error: errors[0],
        errors: errors.length ? errors : undefined,
      });
    }

    const current = await prisma.employeePayout.findFirst({
      where: { team, date, userId },
      select: {
        id: true,
        paidById: true,
        breakdown: true,
      },
    });

    if (!current) {
      return NextResponse.json({ ok: false, error: "Payout não encontrado." }, { status: 404 });
    }

    if (!current.paidById) {
      const recomputed = await recomputeDay(req, date, current.breakdown);
      if (!recomputed.ok) {
        return NextResponse.json(
          { ok: false, error: recomputed.error },
          { status: recomputed.status }
        );
      }
    }

    const paid = await payOne({ team, date, userId, meId });
    if (!paid.ok) {
      return NextResponse.json({ ok: false, error: paid.error }, { status: paid.status });
    }

    const row = await prisma.employeePayout.findFirst({
      where: { team, date, userId },
      include: {
        user: { select: { id: true, name: true, login: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    if (!row) {
      return NextResponse.json({ ok: false, error: "Payout não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      updated: row,
      changed: paid.paid || paid.awaitingApproval,
      via: paid.via,
      paid: paid.paid,
      awaitingApproval: paid.awaitingApproval,
      codigoSolicitacao: paid.codigoSolicitacao || null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const msg = message === "UNAUTHENTICATED" ? "Não autenticado" : message;
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
