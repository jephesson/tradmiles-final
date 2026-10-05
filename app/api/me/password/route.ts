import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const oldPassword = String(body?.oldPassword || "");
  const newPassword = String(body?.newPassword || "");
  const newPassword2 = String(body?.newPassword2 || "");

  if (!oldPassword || !newPassword || !newPassword2) {
    return NextResponse.json({ ok: false, error: "Preencha a senha atual e a nova duas vezes." }, { status: 400 });
  }
  if (newPassword.trim().length < 6) {
    return NextResponse.json({ ok: false, error: "Nova senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }
  if (newPassword !== newPassword2) {
    return NextResponse.json({ ok: false, error: "As novas senhas não conferem." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sess.id },
    select: { id: true, passwordHash: true, passwordEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });
  }
  if (user.passwordEnabled === false) {
    return NextResponse.json({ ok: false, error: "Senha ainda não habilitada." }, { status: 403 });
  }
  if (user.passwordHash !== sha256(oldPassword)) {
    return NextResponse.json({ ok: false, error: "Senha atual incorreta." }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: sha256(newPassword), passwordEnabled: true },
  });

  return NextResponse.json({ ok: true });
}
