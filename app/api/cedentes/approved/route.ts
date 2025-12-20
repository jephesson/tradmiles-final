import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const rows = await prisma.cedente.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
        createdAt: true,
        owner: {
          select: { id: true, name: true, login: true },
        },
      },
    });

    return NextResponse.json({ ok: true, data: rows }, { headers: noCacheHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao listar cedentes aprovados." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
