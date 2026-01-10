import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
// se quiser travar por login, descomenta e usa
// import { requireSession } from "@/lib/auth-server";

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

export async function GET(req: NextRequest) {
  try {
    // await requireSession(); // se quiser restringir

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const ownerId = (searchParams.get("ownerId") || "").trim();

    const where: any = { status: "APPROVED" };

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
        pontosSmiles: true,
        owner: { select: { id: true, name: true, login: true } },
      },
    });

    const mapped = rows.map((r) => {
      const aprovado = r.pontosSmiles || 0;
      const pendente = 0; // TODO: plugar tua regra real
      const total = aprovado + pendente;

      return {
        id: r.id,
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        owner: r.owner,
        smilesAprovado: aprovado,
        smilesPendente: pendente,
        smilesTotalEsperado: total,
      };
    });

    return NextResponse.json({ ok: true, rows: mapped }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar SMILES." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    // await requireSession(); // se quiser restringir

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const pontosSmiles = safeInt(body?.pontosSmiles, NaN as any);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID do cedente é obrigatório." },
        { status: 400, headers: noCacheHeaders() }
      );
    }
    if (!Number.isFinite(pontosSmiles) || pontosSmiles < 0) {
      return NextResponse.json(
        { ok: false, error: "pontosSmiles inválido." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    await prisma.cedente.update({
      where: { id },
      data: { pontosSmiles },
    });

    return NextResponse.json({ ok: true }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar SMILES." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
