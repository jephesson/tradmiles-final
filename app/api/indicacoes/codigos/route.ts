import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();

    const where: {
      status: "APPROVED";
      OR?: Array<{
        identificador?: { contains: string; mode: "insensitive" };
        nomeCompleto?: { contains: string; mode: "insensitive" };
        cpf?: { contains: string };
      }>;
    } = { status: "APPROVED" };

    if (q) {
      const digits = q.replace(/\D+/g, "");
      where.OR = [
        { identificador: { contains: q, mode: "insensitive" } },
        { nomeCompleto: { contains: q, mode: "insensitive" } },
      ];
      if (digits) where.OR.push({ cpf: { contains: digits } });
    }

    const rows = await prisma.cedente.findMany({
      where,
      orderBy: [{ identificador: "asc" }],
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        createdAt: true,
        owner: { select: { id: true, name: true, login: true } },
        _count: { select: { referralsMade: true } },
      },
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        identificador: r.identificador,
        nomeCompleto: r.nomeCompleto,
        cpf: r.cpf,
        createdAt: r.createdAt,
        owner: r.owner,
        indicacoesCount: r._count.referralsMade,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao listar códigos.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
