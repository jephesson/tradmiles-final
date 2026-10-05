import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { SOCIO_PAGES } from "@/lib/roles";
import { assignCardDebtToSocio, defaultCreditorIdForName } from "@/lib/card-debt/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const TEAM = "@vias_aereas";

function pagesFromBody(body: { pages?: unknown }) {
  const allowed = new Set(SOCIO_PAGES.map((p) => p.key));
  const raw = Array.isArray(body?.pages) ? body.pages : [];
  return [...new Set(raw.map((x) => String(x)).filter((x) => allowed.has(x as never)))];
}

export async function GET() {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const [users, creditors] = await Promise.all([
    prisma.user.findMany({
      where: { team: sess.team, role: "socio" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        login: true,
        isActive: true,
        passwordEnabled: true,
        allowedPages: true,
        createdAt: true,
        cardDebtsOwned: { select: { id: true, name: true } },
      },
    }),
    prisma.cardDebtCreditor.findMany({
      where: { team: sess.team },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ownerId: true },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    data: users.map(({ cardDebtsOwned, ...u }) => ({
      ...u,
      cardDebtCreditorId: cardDebtsOwned[0]?.id || null,
      cardDebtName: cardDebtsOwned[0]?.name || null,
    })),
    creditors,
    pages: SOCIO_PAGES,
  });
}

export async function POST(req: Request) {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const login = String(body?.login || "").trim().toLowerCase();
  const password = String(body?.password || "").trim();
  const pages = pagesFromBody(body);

  if (!name || !login) {
    return NextResponse.json({ ok: false, error: "Nome e login são obrigatórios." }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ ok: false, error: "Senha deve ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { login }, select: { id: true } });
  if (exists) {
    return NextResponse.json({ ok: false, error: "Já existe um usuário com esse login." }, { status: 409 });
  }

  const enabled = password.length >= 6;
  const user = await prisma.user.create({
    data: {
      name,
      login,
      team: TEAM,
      role: "socio",
      passwordHash: sha256(enabled ? password : crypto.randomBytes(24).toString("hex")),
      passwordEnabled: enabled,
      allowedPages: pages,
    },
    select: { id: true, name: true, login: true, isActive: true, passwordEnabled: true, allowedPages: true },
  });

  if (pages.includes("dividas-cartoes")) {
    const requested = String(body?.cardDebtCreditorId || "").trim();
    const creditorId = requested || (await defaultCreditorIdForName(sess.team, name));
    await assignCardDebtToSocio({ team: sess.team, socioId: user.id, creditorId });
  }

  return NextResponse.json({ ok: true, data: user }, { status: 201 });
}
