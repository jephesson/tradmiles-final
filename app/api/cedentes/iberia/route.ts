import { NextRequest, NextResponse } from "next/server";
import { activeCedenteWhere } from "@/lib/cedentes/activeCedenteWhere";
import { prisma } from "@/lib/prisma";

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

function safeInt(v: unknown, fb = 0) {
  const s = String(v ?? "").replace(/\D+/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function scoreMedia(score?: {
  rapidezBiometria?: number;
  rapidezSms?: number;
  resolucaoProblema?: number;
  confianca?: number;
} | null) {
  const a = Number(score?.rapidezBiometria || 0);
  const b = Number(score?.rapidezSms || 0);
  const c = Number(score?.resolucaoProblema || 0);
  const d = Number(score?.confianca || 0);
  const avg = (a + b + c + d) / 4;
  return Math.round(avg * 100) / 100;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const ownerId = (searchParams.get("ownerId") || "").trim();

    const where: any = {
      ...activeCedenteWhere(),
      senhaIberia: { not: null },
    };
    if (ownerId) where.ownerId = ownerId;

    if (q) {
      where.OR = [
        { nomeCompleto: { contains: q, mode: "insensitive" } },
        { identificador: { contains: q, mode: "insensitive" } },
        { cpf: { contains: q } },
      ];
    }

    const rows = await prisma.cedente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        emailCriado: true,
        senhaEmail: true,
        senhaIberia: true,
        pontosIberia: true,
        owner: { select: { id: true, name: true, login: true } },
        score: {
          select: {
            rapidezBiometria: true,
            rapidezSms: true,
            resolucaoProblema: true,
            confianca: true,
          },
        },
        blockedAccounts: {
          where: { status: "OPEN" },
          select: { program: true },
        },
      },
    });

    const mapped = rows
      .filter((r) => String(r.senhaIberia || "").trim() !== "")
      .map((r) => ({
        id: r.id,
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        telefone: r.telefone,
        emailCriado: r.emailCriado,
        senhaEmail: r.senhaEmail,
        senhaIberia: r.senhaIberia,
        owner: r.owner,
        scoreMedia: scoreMedia(r.score),
        pontosIberia: r.pontosIberia || 0,
        blockedPrograms: (r.blockedAccounts || []).map((b) => b.program),
      }));

    return NextResponse.json({ ok: true, rows: mapped }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar Iberia." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const pontosIberia = safeInt(body?.pontosIberia, NaN as any);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do cedente é obrigatório." },
        { status: 400, headers: noCacheHeaders() }
      );
    }
    if (!Number.isFinite(pontosIberia) || pontosIberia < 0) {
      return NextResponse.json(
        { ok: false, error: "pontosIberia inválido." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    await prisma.cedente.update({
      where: { id },
      data: { pontosIberia },
    });

    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar Iberia." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
