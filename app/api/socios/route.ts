import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { SOCIO_PAGES } from "@/lib/roles";

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

  const users = await prisma.user.findMany({
    where: { team: sess.team, role: "socio" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      login: true,
      isActive: true,
      allowedPages: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ ok: true, data: users, pages: SOCIO_PAGES });
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
  const password = String(body?.password || "");
  const pages = pagesFromBody(body);

  if (!name || !login || password.length < 6) {
    return NextResponse.json({ ok: false, error: "Nome, login e senha (mín. 6) são obrigatórios." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { login }, select: { id: true } });
  if (exists) {
    return NextResponse.json({ ok: false, error: "Já existe um usuário com esse login." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      login,
      team: TEAM,
      role: "socio",
      passwordHash: sha256(password),
      allowedPages: pages,
    },
    select: { id: true, name: true, login: true, isActive: true, allowedPages: true },
  });
  return NextResponse.json({ ok: true, data: user }, { status: 201 });
}
