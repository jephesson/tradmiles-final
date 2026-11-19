import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { SOCIO_ROLES } from "@/lib/emissores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Convites (link único) para emissores se cadastrarem. Só admin.
 * O link já leva o sócio vinculado e o cartão padrão da taxa.
 */

const VALID_DAYS = 7;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function adminSession() {
  const sess = await requireSession().catch(() => null);
  if (!sess) return { error: bad("Não autenticado", 401) };
  if (sess.role !== "admin") return { error: bad("Só admin gera convite de emissor.", 403) };
  return { sess };
}

function linkFor(req: Request, token: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return `${origin}/emissor/cadastro/${token}`;
}

export async function GET(req: Request) {
  const { sess, error } = await adminSession();
  if (error) return error;

  const rows = await prisma.emissorInvite.findMany({
    where: { team: sess.team },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      token: true,
      linkedSocioId: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      userId: true,
      createdAt: true,
    },
  });
  const userIds = [...new Set(rows.flatMap((r) => [r.linkedSocioId, r.userId || ""]).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, login: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const now = Date.now();

  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      url: linkFor(req, r.token),
      socio: byId.get(r.linkedSocioId) || null,
      emissor: r.userId ? byId.get(r.userId) || null : null,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      status: r.usedAt
        ? "USADO"
        : r.revokedAt
          ? "CANCELADO"
          : r.expiresAt.getTime() < now
            ? "EXPIRADO"
            : "ABERTO",
    })),
  });
}

export async function POST(req: Request) {
  const { sess, error } = await adminSession();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { linkedSocioId?: string; defaultFeeCardId?: string };
  const socioId = String(body.linkedSocioId || "").trim();
  const socio = await prisma.user.findFirst({
    where: { id: socioId, team: sess.team, isActive: true, role: { in: [...SOCIO_ROLES] } },
    select: { id: true },
  });
  if (!socio) return bad("Escolha o sócio vinculado.");

  const cardId = String(body.defaultFeeCardId || "").trim() || null;
  if (cardId) {
    const card = await prisma.employeePaymentCard.findFirst({
      where: { id: cardId, team: sess.team },
      select: { isCompany: true, user: { select: { role: true } } },
    });
    if (!card || (!card.isCompany && !(SOCIO_ROLES as readonly string[]).includes(String(card.user?.role)))) {
      return bad("O cartão precisa ser da empresa ou de um sócio.");
    }
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const invite = await prisma.emissorInvite.create({
    data: {
      team: sess.team,
      token,
      linkedSocioId: socio.id,
      defaultFeeCardId: cardId,
      createdById: sess.id,
      expiresAt: new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000),
    },
    select: { id: true, token: true, expiresAt: true },
  });

  return NextResponse.json(
    { ok: true, data: { id: invite.id, url: linkFor(req, invite.token), expiresAt: invite.expiresAt } },
    { status: 201 }
  );
}

export async function DELETE(req: Request) {
  const { sess, error } = await adminSession();
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id") || "";
  const res = await prisma.emissorInvite.updateMany({
    where: { id, team: sess.team, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!res.count) return bad("Convite não encontrado ou já usado.", 404);
  return NextResponse.json({ ok: true });
}
