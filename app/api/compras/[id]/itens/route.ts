import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function calcPointsFinal(pointsBase: number, bonusMode?: string | null, bonusValue?: number | null) {
  const base = Math.max(0, Math.trunc(pointsBase || 0));
  if (!bonusMode || !bonusValue) return base;

  if (bonusMode === "PERCENT") {
    const pct = Math.max(0, Number(bonusValue));
    return Math.trunc(base * (1 + pct / 100));
  }

  if (bonusMode === "TOTAL") {
    const bonus = Math.max(0, Math.trunc(Number(bonusValue)));
    return base + bonus;
  }

  return base;
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const purchaseId = ctx.params.id;
  const body = await req.json().catch(() => null);

  const type = body?.type as string | undefined;
  const title = String(body?.title || "").trim();

  if (!type) return json({ ok: false, error: "type é obrigatório." }, 400);
  if (!title) return json({ ok: false, error: "title é obrigatório." }, 400);

  const compra = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, status: true },
  });
  if (!compra) return json({ ok: false, error: "Compra não encontrada." }, 404);
  if (compra.status !== "OPEN") return json({ ok: false, error: "Compra não está OPEN." }, 400);

  const pointsBase = Math.trunc(Number(body?.pointsBase || 0));
  const bonusMode = (body?.bonusMode ? String(body.bonusMode) : null) as string | null;
  const bonusValue = body?.bonusValue == null ? null : Math.trunc(Number(body.bonusValue));
  const pointsFinal = calcPointsFinal(pointsBase, bonusMode, bonusValue);

  const amountCents = Math.trunc(Number(body?.amountCents || 0));

  const programFrom = body?.programFrom ?? null;
  const programTo = body?.programTo ?? null;

  const transferMode = body?.transferMode ?? null;
  const pointsDebitedFromOrigin = Math.trunc(Number(body?.pointsDebitedFromOrigin || 0));

  // validações básicas para TRANSFER
  if (type === "TRANSFER") {
    if (!programFrom || !programTo) {
      return json({ ok: false, error: "TRANSFER precisa programFrom e programTo." }, 400);
    }
    if (!transferMode) {
      return json({ ok: false, error: "TRANSFER precisa transferMode." }, 400);
    }
    if (transferMode === "POINTS_PLUS_CASH" && amountCents <= 0) {
      return json({ ok: false, error: "Pontos+dinheiro exige amountCents > 0." }, 400);
    }
  }

  const item = await prisma.purchaseItem.create({
    data: {
      purchaseId,
      type,
      title,
      details: body?.details ? String(body.details) : null,

      programFrom,
      programTo,

      pointsBase,
      bonusMode,
      bonusValue,
      pointsFinal,

      amountCents,
      transferMode,
      pointsDebitedFromOrigin,
    },
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      details: true,
      programFrom: true,
      programTo: true,
      pointsBase: true,
      bonusMode: true,
      bonusValue: true,
      pointsFinal: true,
      amountCents: true,
      transferMode: true,
      pointsDebitedFromOrigin: true,
      createdAt: true,
    },
  });

  return json({ ok: true, item }, 201);
}
