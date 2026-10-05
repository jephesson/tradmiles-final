import { NextResponse } from "next/server";
import type { PixTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { ensureCardDebtSeed } from "@/lib/card-debt/seed";
import { normalizePixKey, pixKeyLooksValid } from "@/lib/inter/pix-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: PixTipo[] = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"];

export async function GET() {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role === "socio") {
    return NextResponse.json({ ok: false, error: "Sócio só visualiza esta tela." }, { status: 403 });
  }
  const creditor = await ensureCardDebtSeed(sess.team);
  return NextResponse.json({
    ok: true,
    data: {
      nome: creditor.name,
      cpf: null,
      banco: null,
      pixTipo: creditor.pixTipo,
      pixKey: creditor.chavePix,
      source: "Dívida cartões",
      cpfMatchesKey: null,
    },
  });
}

export async function PUT(req: Request) {
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
  const pixTipo = String(body?.pixTipo || "").toUpperCase() as PixTipo;
  const rawKey = String(body?.chavePix || "").trim();
  if (!TIPOS.includes(pixTipo)) {
    return NextResponse.json({ ok: false, error: "Tipo de PIX inválido." }, { status: 400 });
  }
  const chavePix = normalizePixKey(pixTipo, rawKey);
  if (!pixKeyLooksValid(pixTipo, chavePix)) {
    return NextResponse.json({ ok: false, error: "Chave PIX inválida." }, { status: 400 });
  }
  const creditor = await ensureCardDebtSeed(sess.team);
  const updated = await prisma.cardDebtCreditor.update({
    where: { id: creditor.id },
    data: { pixTipo, chavePix },
  });
  return NextResponse.json({
    ok: true,
    data: { pixTipo: updated.pixTipo, chavePix: updated.chavePix },
  });
}
