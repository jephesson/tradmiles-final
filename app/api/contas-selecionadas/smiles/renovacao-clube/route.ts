// app/api/contas-selecionadas/smiles/renovacao-clube/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
  const session = await getSessionServer();
  if (!session) return bad("Não autenticado", 401);

  try {
    /**
     * ✅ Por padrão, incluímos CANCELADOS também.
     * Isso é necessário porque muitos "Promo SMILES" do mês atual
     * estão em CANCELED (como no seu print de janeiro/2026).
     *
     * Opcional: se quiser ocultar cancelados no futuro, você pode chamar:
     * /api/.../renovacao-clube?includeCanceled=0
     */
    const url = new URL(req.url);
    const includeCanceled = url.searchParams.get("includeCanceled") !== "0";

    const statusIn = includeCanceled
      ? (["ACTIVE", "PAUSED", "CANCELED"] as const)
      : (["ACTIVE", "PAUSED"] as const);

    /**
     * ✅ Regra correta para deduplicar:
     * 1) pega o MAIS RECENTE por cedente (orderBy updatedAt desc)
     * 2) usa distinct cedenteId
     * 3) depois ordena em memória por smilesBonusEligibleAt para exibição
     */
    const latestPerCedente = await prisma.clubSubscription.findMany({
      where: {
        team: session.team,
        program: "SMILES",
        status: { in: statusIn as any },
        smilesBonusEligibleAt: { not: null },
      },
      orderBy: [{ updatedAt: "desc" }], // ✅ garante "mais recente"
      distinct: ["cedenteId"], // ✅ 1 por cedente
      select: {
        id: true,
        cedenteId: true,
        tierK: true,
        status: true,
        subscribedAt: true,
        lastRenewedAt: true,
        renewalDay: true,
        smilesBonusEligibleAt: true,
        updatedAt: true, // útil para tie-break e auditoria
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

    // ✅ Ordena para a UI (mês/dia), sem quebrar a deduplicação
    const unique = [...latestPerCedente].sort((a, b) => {
      const av = String(a.smilesBonusEligibleAt || "");
      const bv = String(b.smilesBonusEligibleAt || "");
      if (av !== bv) return av.localeCompare(bv); // asc por data elegível
      // tie-break: mais atualizado primeiro
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });

    return NextResponse.json({ ok: true, items: unique });
  } catch (e) {
    console.error(e);
    return bad("Falha ao carregar renovação do clube (Smiles).", 500);
  }
}
