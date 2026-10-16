import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { EMPTY_CREDITOR_KEY } from "@/lib/debts/allocate";
import type { PixTipo } from "@prisma/client";
import { parsePixCadastro } from "@/lib/inter/pix-key";

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
  const wantsLink = Object.prototype.hasOwnProperty.call(body, "linkedUserId");
  const wantsPix = Object.prototype.hasOwnProperty.call(body, "pixTipo") || Object.prototype.hasOwnProperty.call(body, "chavePix");

  if (!groupKey) {
    return NextResponse.json({ ok: false, error: "Credor não informado." }, { status: 400 });
  }

  let linkedUserId: string | null | undefined;
  if (wantsLink) {
    linkedUserId =
      body?.linkedUserId === null || body?.linkedUserId === ""
        ? null
        : String(body?.linkedUserId || "").trim();

    if (linkedUserId) {
      const user = await prisma.user.findFirst({
        where: { id: linkedUserId, team: sess.team, role: { in: ["admin", "staff", "socio"] } },
        select: { id: true },
      });
      if (!user) {
        return NextResponse.json({ ok: false, error: "Pessoa não encontrada." }, { status: 404 });
      }
    }
  }

  let pix: { pixTipo: PixTipo | null; chavePix: string | null } | null = null;
  if (wantsPix) {
    if (groupKey === EMPTY_CREDITOR_KEY) {
      return NextResponse.json({ ok: false, error: "Informe o nome da pessoa para cadastrar o PIX." }, { status: 400 });
    }
    const parsed = parsePixCadastro(body);
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    if (!parsed.skip) {
      pix = { pixTipo: parsed.pixTipo, chavePix: parsed.chavePix };
    }
  }

  const where =
    groupKey === EMPTY_CREDITOR_KEY
      ? { OR: [{ creditorName: null }, { creditorName: "" }] }
      : { creditorName: groupKey };

  let count = 0;
  if (wantsLink) {
    const updated = await prisma.debt.updateMany({
      where,
      data: { linkedUserId },
    });
    count = updated.count;
  }

  let savedPix: { pixTipo: string | null; chavePix: string | null } | null = null;
  if (pix && groupKey !== EMPTY_CREDITOR_KEY) {
    const row = await prisma.personDebtCreditor.upsert({
      where: { name: groupKey },
      create: { name: groupKey, pixTipo: pix.pixTipo, chavePix: pix.chavePix },
      update: { pixTipo: pix.pixTipo, chavePix: pix.chavePix },
      select: { pixTipo: true, chavePix: true },
    });
    savedPix = row;
  }

  return NextResponse.json({
    ok: true,
    data: { count, linkedUserId: wantsLink ? linkedUserId ?? null : undefined, pix: savedPix },
  });
}
