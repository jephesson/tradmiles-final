import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { parseRole } from "@/lib/roles";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  totpOtpauthUrl,
  totpRequired,
  verifyTotpCode,
} from "@/lib/totp";
import {
  clearPending2faCookie,
  readPending2faCookie,
  setSessionCookie,
} from "@/lib/tm-session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

async function finishLogin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado");
  const role = parseRole(user.role);
  const pages = Array.isArray(user.allowedPages) ? user.allowedPages : [];
  const session = {
    id: user.id,
    name: user.name?.trim() || user.login,
    login: user.login,
    email: user.email,
    team: user.team,
    role,
    pages,
  };
  const res = NextResponse.json({ ok: true, data: { session } }, { headers: noCache() });
  setSessionCookie(res, {
    id: user.id,
    login: user.login,
    role,
    team: user.team,
    pages,
  });
  clearPending2faCookie(res);
  return res;
}

async function pendingUser(req: Request) {
  const id = readPending2faCookie(req);
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  try {
    if (action === "setup") {
      const user = await pendingUser(req);
      if (!user || !totpRequired(user.role)) {
        return NextResponse.json({ ok: false, error: "Faça login de novo." }, { status: 401, headers: noCache() });
      }
      if (user.totpEnabled) {
        return NextResponse.json({ ok: false, error: "2FA já está ativo. Use o código do app." }, { status: 400, headers: noCache() });
      }
      const secret = generateTotpSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: encryptTotpSecret(secret), totpEnabled: false },
      });
      const otpauth = totpOtpauthUrl({ login: user.login, secret });
      const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 220, margin: 1 });
      return NextResponse.json({ ok: true, data: { qrDataUrl, secret, login: user.login } }, { headers: noCache() });
    }

    if (action === "enable") {
      const user = await pendingUser(req);
      if (!user || !totpRequired(user.role)) {
        return NextResponse.json({ ok: false, error: "Faça login de novo." }, { status: 401, headers: noCache() });
      }
      if (!user.totpSecretEnc) {
        return NextResponse.json({ ok: false, error: "Gere o QR code primeiro." }, { status: 400, headers: noCache() });
      }
      const secret = decryptTotpSecret(user.totpSecretEnc);
      if (!verifyTotpCode(secret, String(body?.code || ""))) {
        return NextResponse.json({ ok: false, error: "Código inválido. Tente o número que está no app agora." }, { status: 401, headers: noCache() });
      }
      await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
      return finishLogin(user.id);
    }

    if (action === "verify") {
      const user = await pendingUser(req);
      if (!user || !totpRequired(user.role)) {
        return NextResponse.json({ ok: false, error: "Faça login de novo." }, { status: 401, headers: noCache() });
      }
      if (!user.totpEnabled || !user.totpSecretEnc) {
        return NextResponse.json({ ok: false, error: "Cadastre o Authenticator primeiro." }, { status: 400, headers: noCache() });
      }
      const secret = decryptTotpSecret(user.totpSecretEnc);
      if (!verifyTotpCode(secret, String(body?.code || ""))) {
        return NextResponse.json({ ok: false, error: "Código inválido." }, { status: 401, headers: noCache() });
      }
      return finishLogin(user.id);
    }

    if (action === "reset") {
      let sess;
      try {
        sess = await requireSession();
      } catch {
        return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401, headers: noCache() });
      }
      if (sess.role !== "admin") {
        return NextResponse.json({ ok: false, error: "Só admin reseta o Authenticator." }, { status: 403, headers: noCache() });
      }
      const userId = String(body?.userId || "").trim();
      if (!userId) {
        return NextResponse.json({ ok: false, error: "Informe o usuário." }, { status: 400, headers: noCache() });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { totpEnabled: false, totpSecretEnc: null },
      });
      return NextResponse.json({ ok: true }, { headers: noCache() });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400, headers: noCache() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro no 2FA.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: noCache() });
  }
}
