import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { SOCIO_PAGES } from "@/lib/roles";
import { assignCardDebtToSocio, defaultCreditorIdForName } from "@/lib/card-debt/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function pagesFromBody(body: { pages?: unknown }) {
  const allowed = new Set(SOCIO_PAGES.map((p) => p.key));
  const raw = Array.isArray(body?.pages) ? body.pages : [];
  return [...new Set(raw.map((x) => String(x)).filter((x) => allowed.has(x as never)))];
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const found = await prisma.user.findFirst({
    where: { id, team: sess.team, role: "socio" },
    select: { id: true },
  });
  if (!found) return NextResponse.json({ ok: false, error: "Sócio não encontrado." }, { status: 404 });

  const data: {
    name?: string;
    login?: string;
    isActive?: boolean;
    allowedPages?: string[];
    passwordHash?: string;
    passwordEnabled?: boolean;
  } = {};

  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.login === "string" && body.login.trim()) data.login = body.login.trim().toLowerCase();
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
  if (Array.isArray(body?.pages)) data.allowedPages = pagesFromBody(body);
  if (typeof body?.password === "string" && body.password.trim()) {
    if (body.password.trim().length < 6) {
      return NextResponse.json({ ok: false, error: "Senha deve ter pelo menos 6 caracteres." }, { status: 400 });
    }
    data.passwordHash = sha256(body.password.trim());
    data.passwordEnabled = true;
  }

  try {
    const user = await prisma.user.update({
      where: { id: found.id },
      data,
      select: { id: true, name: true, login: true, isActive: true, passwordEnabled: true, allowedPages: true },
    });

    const pages = data.allowedPages ?? user.allowedPages;
    if (pages.includes("dividas-cartoes")) {
      const requested = body?.cardDebtCreditorId;
      const creditorId =
        requested === null || requested === ""
          ? null
          : String(requested || "").trim() || (await defaultCreditorIdForName(sess.team, user.name));
      if (requested !== undefined || data.allowedPages) {
        await assignCardDebtToSocio({ team: sess.team, socioId: user.id, creditorId });
      }
    } else if (data.allowedPages) {
      await assignCardDebtToSocio({ team: sess.team, socioId: user.id, creditorId: null });
    }

    return NextResponse.json({ ok: true, data: user });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: "Login já está em uso." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Erro ao salvar." }, { status: 500 });
  }
}
