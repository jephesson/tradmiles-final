import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma"; // ✅ ajuste se o seu prisma exporta diferente

export const dynamic = "force-dynamic";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

function pickSenhaPrograma(program: Program, c: any) {
  if (program === "LATAM") return c?.senhaLatamPass ?? null;
  if (program === "SMILES") return c?.senhaSmiles ?? null;
  if (program === "LIVELO") return c?.senhaLivelo ?? null;
  if (program === "ESFERA") return c?.senhaEsfera ?? null;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    // ✅ “já tá logado” → só exige cookie existir (sem pedir senha)
    const jar = cookies();
    const hasSession =
      jar.get("tm.session")?.value ||
      jar.get("auth_session")?.value ||
      jar.get("session")?.value;

    if (!hasSession) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cedenteId = (searchParams.get("cedenteId") || "").trim();
    const program = (searchParams.get("program") || "").trim().toUpperCase() as Program;

    if (!cedenteId) {
      return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    }
    if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program)) {
      return NextResponse.json({ ok: false, error: "program inválido." }, { status: 400 });
    }

    const cedente = await prisma.cedente.findUnique({
      where: { id: cedenteId },
      select: {
        cpf: true,
        emailCriado: true,
        senhaEmail: true,
        senhaLatamPass: true,
        senhaSmiles: true,
        senhaLivelo: true,
        senhaEsfera: true,
      },
    });

    if (!cedente) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        cpf: cedente.cpf,
        email: cedente.emailCriado ?? null,
        senhaPrograma: pickSenhaPrograma(program, cedente),
        senhaEmail: cedente.senhaEmail ?? null,
      },
    });
  } catch (e: any) {
    // ✅ evita 500 “mudo”
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro interno ao buscar credenciais." },
      { status: 500 }
    );
  }
}
