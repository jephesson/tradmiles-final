import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { resolveCardDebtCreditor } from "@/lib/card-debt/scope";
import { payCardDebtViaInter } from "@/lib/inter/pay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function markLocal(ids: string[]) {
  await prisma.cardDebtInstallment.updateMany({
    where: { id: { in: ids }, status: "OPEN" },
    data: { status: "PAID", paidAt: new Date(), paidVia: "local" },
  });
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
  const via = String(body?.via || "local") === "inter" ? "inter" : "local";
  const ids = Array.isArray(body?.installmentIds)
    ? [...new Set(
        (body.installmentIds as unknown[])
          .map((x) => String(x || "").trim())
          .filter((x): x is string => Boolean(x))
      )]
    : [];
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Selecione ao menos uma parcela." }, { status: 400 });
  }

  const rows = await prisma.cardDebtInstallment.findMany({
    where: { id: { in: ids }, status: "OPEN", purchase: { team: sess.team } },
    include: { purchase: { select: { title: true, creditor: true } } },
  });
  if (!rows.length) {
    return NextResponse.json({ ok: false, error: "Nenhuma parcela em aberto nesses IDs." }, { status: 400 });
  }

  const amountCents = rows.reduce((s, r) => s + r.amountCents, 0);
  const rowIds = rows.map((r) => r.id);

  if (via === "local") {
    await markLocal(rowIds);
    const creditor = rows[0]?.purchase?.creditor;
    if (creditor) {
      const { abateCardPayOnPersonDebt } = await import("@/lib/card-debt/sync-person-debt");
      for (const r of rows) {
        await abateCardPayOnPersonDebt({
          creditorId: creditor.id,
          creditorName: creditor.name,
          amountCents: r.amountCents,
          note: `Cartão: ${r.purchase.title} (${r.n}ª)`,
          sourceRef: `card-inst:${r.id}`,
        });
      }
    }
    return NextResponse.json({ ok: true, data: { via: "local", paid: true, amountCents, count: rowIds.length } });
  }

  const { creditor } = await resolveCardDebtCreditor(sess);
  if (!creditor?.chavePix || !creditor.pixTipo) {
    return NextResponse.json(
      { ok: false, error: "Cadastre a chave PIX do Jocykleber nesta tela antes de enviar." },
      { status: 400 }
    );
  }

  try {
    const result = await payCardDebtViaInter({
      team: sess.team,
      installmentIds: rowIds,
      amountCents,
      pixTipo: creditor.pixTipo,
      pixKey: creditor.chavePix,
      description: `Cartao ${rows.length} parc`.slice(0, 140),
      requestedById: sess.id,
    });
    if (result.paid) {
      await prisma.cardDebtInstallment.updateMany({
        where: { id: { in: rowIds }, status: "OPEN" },
        data: { status: "PAID", paidAt: new Date(), paidVia: result.via === "inter" ? "inter" : "local" },
      });
    }
    return NextResponse.json({ ok: true, data: { ...result, amountCents, count: rowIds.length } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Falha no PIX." }, { status: 400 });
  }
}
