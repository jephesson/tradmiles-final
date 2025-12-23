import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ numero: string }> }
) {
  const { numero } = await ctx.params;

  const compra = await prisma.purchase.findUnique({
    where: { numero }, // ✅ aqui é o numero (ID00001)
    select: {
      id: true,
      numero: true,
      status: true,
      note: true,
      createdAt: true,
      cedentePayCents: true,
      vendorCommissionBps: true,
      extraPoints: true,
      extraPointsCostCents: true,
      cedente: {
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          cpf: true,
          pontosLatam: true,
          pontosSmiles: true,
          pontosLivelo: true,
          pontosEsfera: true,
          blockedAccounts: {
            where: { status: "OPEN" },
            select: { program: true, status: true },
          },
          owner: { select: { id: true, name: true, login: true } },
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          details: true,
          programFrom: true,
          programTo: true,
          pointsBase: true,
          bonusMode: true,
          bonusValue: true,
          pointsFinal: true,
          amountCents: true,
          transferMode: true,
          pointsDebitedFromOrigin: true,
          createdAt: true,
        },
      },
    },
  });

  if (!compra) return json({ ok: false, error: "Compra não encontrada." }, 404);

  return json({ ok: true, compra });
}
