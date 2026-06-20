import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import {
  PROGRAM_CRIACAO_LABEL,
  ProgramCreacao,
  programCreacaoPrismaWhere,
} from "@/lib/cedentes/programCreacaoPendente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = new Set<ProgramCreacao>(["LATAM", "SMILES", "LIVELO"]);

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const url = new URL(req.url);
    const programRaw = String(url.searchParams.get("program") || "").trim().toUpperCase();
    const q = String(url.searchParams.get("q") || "").trim();

    if (!PROGRAMS.has(programRaw as ProgramCreacao)) {
      return NextResponse.json(
        { ok: false, error: "Programa inválido. Use LATAM, SMILES ou LIVELO." },
        { status: 400 }
      );
    }

    const program = programRaw as ProgramCreacao;

    const where: {
      status: { in: ["PENDING", "APPROVED"] };
      AND: unknown[];
    } = {
      status: { in: ["PENDING", "APPROVED"] },
      AND: [programCreacaoPrismaWhere(program)],
    };

    if (q) {
      const digits = q.replace(/\D+/g, "");
      where.AND.push({
        OR: [
          { nomeCompleto: { contains: q, mode: "insensitive" } },
          { identificador: { contains: q, mode: "insensitive" } },
          ...(digits ? [{ cpf: { contains: digits } }] : []),
        ],
      });
    }

    const rows = await prisma.cedente.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        emailCriado: true,
        status: true,
        senhaLatamPass: true,
        senhaSmiles: true,
        senhaLivelo: true,
        latamCreacaoPendente: true,
        smilesCreacaoPendente: true,
        liveloCreacaoPendente: true,
        createdAt: true,
        owner: { select: { id: true, name: true, login: true } },
      },
      take: 500,
    });

    return NextResponse.json({
      ok: true,
      data: {
        program,
        label: PROGRAM_CRIACAO_LABEL[program],
        items: rows,
        total: rows.length,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao listar.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
