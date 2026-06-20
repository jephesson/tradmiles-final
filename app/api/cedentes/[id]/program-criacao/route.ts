import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import {
  PROGRAM_CRIACAO_LABEL,
  ProgramCreacao,
  programCreacaoFlagUpdate,
} from "@/lib/cedentes/programCreacaoPendente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROGRAMS = new Set<ProgramCreacao>(["LATAM", "SMILES", "LIVELO"]);
const STATUSES = new Set(["PENDENTE", "RESOLVIDO", "EXCLUIR"]);

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const programRaw = String(body?.program || "").trim().toUpperCase();
    const statusRaw = String(body?.status || body?.action || "").trim().toUpperCase();

    if (!PROGRAMS.has(programRaw as ProgramCreacao)) {
      return NextResponse.json(
        { ok: false, error: "Programa inválido. Use LATAM, SMILES ou LIVELO." },
        { status: 400 }
      );
    }

    if (!STATUSES.has(statusRaw)) {
      return NextResponse.json(
        { ok: false, error: "Status inválido. Use PENDENTE, RESOLVIDO ou EXCLUIR." },
        { status: 400 }
      );
    }

    const program = programRaw as ProgramCreacao;
    const status = statusRaw as "PENDENTE" | "RESOLVIDO" | "EXCLUIR";

    const existing = await prisma.cedente.findUnique({
      where: { id },
      select: { id: true, status: true, nomeCompleto: true, identificador: true },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404 });
    }

    if (existing.status === "REJECTED") {
      return NextResponse.json({ ok: false, error: "Cedente rejeitado." }, { status: 400 });
    }

    const updated = await prisma.cedente.update({
      where: { id },
      data: programCreacaoFlagUpdate(program, status),
      select: {
        id: true,
        latamCreacaoPendente: true,
        smilesCreacaoPendente: true,
        liveloCreacaoPendente: true,
        latamCreacaoResolvido: true,
        smilesCreacaoResolvido: true,
        liveloCreacaoResolvido: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...updated,
        program,
        label: PROGRAM_CRIACAO_LABEL[program],
        status,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao atualizar.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
