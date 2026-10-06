import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { allocateDebtPayment, EMPTY_CREDITOR_KEY } from "@/lib/debts/allocate";
import { personDebtPixDestino } from "@/lib/debts/destino";
import { payPersonDebtViaInter } from "@/lib/inter/pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCentsFromInput(s: unknown) {
  const cleaned = String(s ?? "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export async function POST(req: NextRequest) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role === "socio") {
    return NextResponse.json({ ok: false, error: "Sócio só visualiza." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const rawGroupKey = String(body?.groupKey || "").trim();
    const note = String(body?.note || "").trim() || null;
    const via = String(body?.via || "local") === "inter" ? "inter" : "local";
    const amountCents = body?.amountCents
      ? Math.round(Number(body.amountCents))
      : toCentsFromInput(body?.amount);

    if (!rawGroupKey) {
      return NextResponse.json({ ok: false, error: "Credor não informado." }, { status: 400 });
    }

    const groupKey = rawGroupKey || EMPTY_CREDITOR_KEY;

    if (via === "inter") {
      if (!(amountCents > 0)) {
        return NextResponse.json({ ok: false, error: "Informe o valor do PIX." }, { status: 400 });
      }
      const destino = await personDebtPixDestino(groupKey);
      const result = await payPersonDebtViaInter({
        team: sess.team,
        groupKey,
        amountCents,
        pixTipo: destino.pixTipo,
        pixKey: destino.pixKey,
        description: `Divida ${groupKey === EMPTY_CREDITOR_KEY ? "sem pessoa" : groupKey}`.slice(0, 140),
        requestedById: sess.id,
      });
      if (result.paid) {
        const alloc = await allocateDebtPayment({
          groupKey,
          amountCents,
          note: note || "PIX Inter",
          paidVia: "inter",
          sourceKind: "PERSON_PIX",
          sourceRef: result.codigoSolicitacao || `paid-${Date.now()}`,
        });
        return NextResponse.json({ ok: true, data: { ...result, ...alloc } });
      }
      return NextResponse.json({ ok: true, data: result });
    }

    const alloc = await allocateDebtPayment({
      groupKey,
      amountCents: amountCents > 0 ? amountCents : 0,
      note: note || (amountCents > 0 ? "Pagamento parcial" : "Quitação em lote por credor"),
      paidVia: "local",
    });

    if (!alloc.paidCents) {
      return NextResponse.json({ ok: false, error: "Esse credor não possui saldo pendente." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        debtsCount: alloc.debts.length,
        totalPaidCents: alloc.paidCents,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao pagar dívidas do credor." },
      { status: 400 }
    );
  }
}
