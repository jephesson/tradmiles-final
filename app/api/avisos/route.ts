import { NextRequest, NextResponse } from "next/server";
import { AvisoStatus, AvisoAudience, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function bad(error: string, status = 400) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: noCacheHeaders() }
  );
}

function normalizeStatus(raw: unknown): AvisoStatus | null {
  const v = String(raw || "")
    .trim()
    .toUpperCase();
  if (v === AvisoStatus.PENDENTE) return AvisoStatus.PENDENTE;
  if (v === AvisoStatus.RESOLVIDO) return AvisoStatus.RESOLVIDO;
  return null;
}

function normalizeAudience(raw: unknown): AvisoAudience | null {
  const v = String(raw || "")
    .trim()
    .toUpperCase();
  if (v === AvisoAudience.GROUP) return AvisoAudience.GROUP;
  if (v === AvisoAudience.USER) return AvisoAudience.USER;
  if (v === AvisoAudience.SELF) return AvisoAudience.SELF;
  return null;
}

function normalizeText(raw: unknown): string {
  return String(raw || "").trim();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateISO(raw: unknown): string | null {
  const v = String(raw || "").trim();
  if (!DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return v;
}

const avisoInclude = {
  targetUser: { select: { id: true, name: true, login: true } },
  createdBy: { select: { id: true, name: true, login: true } },
  resolvedBy: { select: { id: true, name: true, login: true } },
} satisfies Prisma.AvisoInclude;

type AvisoRow = Prisma.AvisoGetPayload<{ include: typeof avisoInclude }>;

function mapRow(row: AvisoRow) {
  return {
    id: row.id,
    status: row.status,
    titulo: row.titulo,
    texto: row.texto,
    dateISO: row.dateISO,
    audience: row.audience,
    targetUser: row.targetUser,
    createdBy: row.createdBy,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const session = await requireSession();

    // Visibilidade:
    // - GROUP: todo o time
    // - USER: destinatário = eu OU criado por mim
    // - SELF: criado por mim
    const rows = await prisma.aviso.findMany({
      where: {
        team: session.team,
        OR: [
          { audience: AvisoAudience.GROUP },
          { audience: AvisoAudience.USER, targetUserId: session.id },
          { audience: AvisoAudience.USER, createdById: session.id },
          { audience: AvisoAudience.SELF, createdById: session.id },
        ],
      },
      include: avisoInclude,
      orderBy: [{ dateISO: "desc" }, { createdAt: "desc" }],
      take: 5000,
    });

    const members = await prisma.user.findMany({
      where: { team: session.team, isActive: true },
      select: { id: true, name: true, login: true },
      orderBy: { name: "asc" },
      take: 200,
    });

    return NextResponse.json(
      {
        ok: true,
        rows: rows.map(mapRow),
        members,
        me: { id: session.id },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao carregar avisos.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const titulo = normalizeText(body?.titulo);
    const texto = normalizeText(body?.texto);
    const status = normalizeStatus(body?.status) || AvisoStatus.PENDENTE;
    const audience = normalizeAudience(body?.audience) || AvisoAudience.GROUP;
    const dateISO =
      normalizeDateISO(body?.dateISO) ||
      new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

    if (texto.length < 3) return bad("O aviso deve ter pelo menos 3 caracteres.");
    if (texto.length > 4000) return bad("Aviso muito longo (máximo 4000 caracteres).");
    if (titulo.length > 160) return bad("Título muito longo (máximo 160 caracteres).");

    let targetUserId: string | null = null;
    if (audience === AvisoAudience.USER) {
      const id = String(body?.targetUserId || "").trim();
      if (!id) return bad("Selecione o destinatário do aviso.");
      const member = await prisma.user.findFirst({
        where: { id, team: session.team },
        select: { id: true },
      });
      if (!member) return bad("Destinatário não encontrado no time.", 404);
      targetUserId = member.id;
    }

    const created = await prisma.aviso.create({
      data: {
        team: session.team,
        titulo: titulo || null,
        texto,
        status,
        dateISO,
        audience,
        targetUserId,
        resolvedAt: status === AvisoStatus.RESOLVIDO ? new Date() : null,
        resolvedById: status === AvisoStatus.RESOLVIDO ? session.id : null,
        createdById: session.id,
      },
      include: avisoInclude,
    });

    return NextResponse.json(
      { ok: true, row: mapRow(created) },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao criar aviso.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);

    const id = String(body?.id || "").trim();
    if (!id) return bad("id é obrigatório.");

    const current = await prisma.aviso.findFirst({
      where: { id, team: session.team },
      select: { id: true, status: true },
    });

    if (!current) return bad("Aviso não encontrado.", 404);

    const data: Prisma.AvisoUpdateInput = {};

    if (body?.titulo != null) {
      const titulo = normalizeText(body.titulo);
      if (titulo.length > 160) return bad("Título muito longo (máximo 160 caracteres).");
      data.titulo = titulo || null;
    }

    if (body?.texto != null) {
      const texto = normalizeText(body.texto);
      if (texto.length < 3) return bad("O aviso deve ter pelo menos 3 caracteres.");
      if (texto.length > 4000) return bad("Aviso muito longo (máximo 4000 caracteres).");
      data.texto = texto;
    }

    if (body?.dateISO != null) {
      const dateISO = normalizeDateISO(body.dateISO);
      if (!dateISO) return bad("Data inválida. Use o formato AAAA-MM-DD.");
      data.dateISO = dateISO;
    }

    const nextStatus = body?.status != null ? normalizeStatus(body.status) : null;
    if (body?.status != null && !nextStatus) {
      return bad("Status inválido. Use PENDENTE ou RESOLVIDO.");
    }

    if (nextStatus) {
      data.status = nextStatus;
      if (nextStatus === AvisoStatus.RESOLVIDO) {
        data.resolvedAt = new Date();
        data.resolvedBy = { connect: { id: session.id } };
      } else {
        data.resolvedAt = null;
        data.resolvedBy = { disconnect: true };
      }
    }

    if (Object.keys(data).length === 0) {
      return bad("Nenhuma alteração informada.");
    }

    const updated = await prisma.aviso.update({
      where: { id: current.id },
      data,
      include: avisoInclude,
    });

    return NextResponse.json(
      { ok: true, row: mapRow(updated) },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao atualizar aviso.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") || "").trim();
    if (!id) return bad("id é obrigatório.");

    const current = await prisma.aviso.findFirst({
      where: { id, team: session.team },
      select: { id: true, createdById: true },
    });
    if (!current) return bad("Aviso não encontrado.", 404);

    // Só o autor ou um admin pode excluir
    if (current.createdById !== session.id && session.role !== "admin") {
      return bad("Você não tem permissão para excluir este aviso.", 403);
    }

    await prisma.aviso.delete({ where: { id: current.id } });

    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (e: any) {
    if (String(e?.message || "") === "UNAUTHENTICATED") {
      return bad("Não autenticado.", 401);
    }
    return bad(e?.message || "Falha ao excluir aviso.", 500);
  }
}
