import { NextResponse } from "next/server";
import type { PixTipo } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { normalizePixKey, pixKeyLooksValid } from "@/lib/inter/pix-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS: PixTipo[] = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"];

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return bad("Não autenticado", 401);
  }
  const url = new URL(req.url);
  let userId = (url.searchParams.get("userId") || "").trim() || sess.id;
  if (userId !== sess.id && sess.role !== "admin") return bad("Sem permissão.", 403);

  const user = await prisma.user.findFirst({
    where: { id: userId, team: sess.team },
    select: { id: true, pixTipo: true, chavePix: true },
  });
  if (!user) return bad("Funcionário não encontrado.", 404);
  return NextResponse.json({ ok: true, data: user });
}

export async function PUT(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return bad("Não autenticado", 401);
  }
  const body = await req.json().catch(() => ({}));
  let userId = String(body?.userId || "").trim() || sess.id;
  if (userId !== sess.id && sess.role !== "admin") return bad("Sem permissão.", 403);

  const pixTipo = String(body?.pixTipo || "").toUpperCase() as PixTipo;
  const rawKey = String(body?.chavePix || "").trim();
  if (!TIPOS.includes(pixTipo)) return bad("Tipo de PIX inválido.");
  const chavePix = normalizePixKey(pixTipo, rawKey);
  if (!pixKeyLooksValid(pixTipo, chavePix)) return bad("Chave PIX inválida.");

  const found = await prisma.user.findFirst({
    where: { id: userId, team: sess.team },
    select: { id: true },
  });
  if (!found) return bad("Funcionário não encontrado.", 404);

  const user = await prisma.user.update({
    where: { id: found.id },
    data: { pixTipo, chavePix },
    select: { id: true, pixTipo: true, chavePix: true },
  });
  return NextResponse.json({ ok: true, data: user });
}
