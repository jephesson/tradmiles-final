import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { allocateDebtPayment, EMPTY_CREDITOR_KEY } from "@/lib/debts/allocate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role === "socio") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const groupKey = String(body?.groupKey || "").trim();
  const linkedUserId = body?.linkedUserId === null || body?.linkedUserId === ""
    ? null
    : String(body?.linkedUserId || "").trim();

  if (!groupKey) {
    return NextResponse.json({ ok: false, error: "Credor não informado." }, { status: 400 });
  }

  if (linkedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: linkedUserId, team: sess.team, role: { in: ["staff", "socio"] } },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "Funcionário ou sócio não encontrado." }, { status: 404 });
    }
  }

  const where =
    groupKey === EMPTY_CREDITOR_KEY
      ? { OR: [{ creditorName: null }, { creditorName: "" }] }
      : { creditorName: groupKey };

  const updated = await prisma.debt.updateMany({
    where,
    data: { linkedUserId },
  });

  return NextResponse.json({ ok: true, data: { count: updated.count, linkedUserId } });
}
