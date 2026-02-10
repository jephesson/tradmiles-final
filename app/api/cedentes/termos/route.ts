// app/api/cedentes/termos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { CedenteStatus, TermTriState, TermResponseTime } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const TRI = new Set<string>(["YES", "NO", "NO_RESPONSE"]);
const RT = new Set<string>(["H1", "H2", "H3", "GT3"]);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const termoVersao = (searchParams.get("versao") || "v1").trim();

  const cedentes = await prisma.cedente.findMany({
    where: {
      status: CedenteStatus.APPROVED, // "disponíveis" => aprovados
    },
    orderBy: { nomeCompleto: "asc" },
    select: {
      id: true,
      nomeCompleto: true,
      telefone: true,
      owner: { select: { id: true, name: true, login: true } },
      termReviews: {
        where: { termoVersao },
        take: 1,
        select: {
          aceiteOutros: true,
          aceiteLatam: true,
          exclusaoDef: true,
          responseTime: true,
          disponibilidadePoints: true,
          updatedAt: true,
        },
      },
    },
  });

  const data = cedentes.map((c) => ({
    id: c.id,
    nomeCompleto: c.nomeCompleto,
    telefone: c.telefone,
    owner: c.owner,
    review: c.termReviews[0] || null,
  }));

  return NextResponse.json({ ok: true, data }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const cedenteId = asString(body?.cedenteId).trim();
  const termoVersao = (asString(body?.termoVersao).trim() || "v1").trim();

  if (!cedenteId) {
    return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
  }

  const aceiteOutrosRaw = asString(body?.aceiteOutros).toUpperCase();
  const aceiteLatamRaw = asString(body?.aceiteLatam).toUpperCase();
  const exclusaoDefRaw = asString(body?.exclusaoDef).toUpperCase();
  const responseTimeRaw = asString(body?.responseTime).toUpperCase();

  const aceiteOutros = TRI.has(aceiteOutrosRaw) ? (aceiteOutrosRaw as TermTriState) : null;
  const aceiteLatam = TRI.has(aceiteLatamRaw) ? (aceiteLatamRaw as TermTriState) : null;
  const exclusaoDef = TRI.has(exclusaoDefRaw) ? (exclusaoDefRaw as TermTriState) : null;
  const responseTime = RT.has(responseTimeRaw) ? (responseTimeRaw as TermResponseTime) : null;

  const disponibilidadePoints = clampInt(body?.disponibilidadePoints, 0, 70);

  const review = await prisma.cedenteTermReview.upsert({
    where: {
      uniq_cedente_termo_versao: { cedenteId, termoVersao },
    },
    create: {
      cedenteId,
      termoVersao,
      aceiteOutros,
      aceiteLatam,
      exclusaoDef,
      responseTime,
      disponibilidadePoints,
    },
    update: {
      aceiteOutros,
      aceiteLatam,
      exclusaoDef,
      responseTime,
      disponibilidadePoints,
    },
    select: {
      aceiteOutros: true,
      aceiteLatam: true,
      exclusaoDef: true,
      responseTime: true,
      disponibilidadePoints: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, data: review }, { status: 200 });
}
