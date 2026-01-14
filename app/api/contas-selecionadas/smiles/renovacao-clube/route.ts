// app/api/contas-selecionadas/smiles/renovacao-clube/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET() {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  try {
    const items = await prisma.clubSubscription.findMany({
      where: {
        team: session.team,
        program: "SMILES",
        status: { in: ["ACTIVE", "PAUSED"] },
        smilesBonusEligibleAt: { not: null },
      },
      orderBy: [{ smilesBonusEligibleAt: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        cedenteId: true,
        tierK: true,
        status: true,
        subscribedAt: true,
        lastRenewedAt: true,
        renewalDay: true,
        smilesBonusEligibleAt: true,
        cedente: {
          select: {
            id: true,
            identificador: true,
            nomeCompleto: true,
            cpf: true,
            pontosSmiles: true,
            owner: { select: { id: true, name: true, login: true } },
          },
        },
      },
    });

    // Se houver duplicatas por cedente, mantém o mais recente (por updatedAt desc no orderBy)
    const seen = new Set<string>();
    const unique = items.filter((it) => {
      if (seen.has(it.cedenteId)) return false;
      seen.add(it.cedenteId);
      return true;
    });

    return NextResponse.json({ ok: true, items: unique });
  } catch {
    return bad("Falha ao carregar renovação do clube (Smiles).", 500);
  }
}
