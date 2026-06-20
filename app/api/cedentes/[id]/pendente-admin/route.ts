import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { syncPendingReferral } from "@/lib/cedente-referrals";
import { deriveProgramCreacaoFlags } from "@/lib/cedentes/programCreacaoPendente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Somente admin pode alterar." }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });
    }

    const cedente = await prisma.cedente.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        senhaLatamPass: true,
        senhaSmiles: true,
        senhaLivelo: true,
        latamCreacaoPendente: true,
        smilesCreacaoPendente: true,
        liveloCreacaoPendente: true,
      },
    });

    if (!cedente) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404 });
    }
    if (cedente.status !== "PENDING") {
      return NextResponse.json(
        { ok: false, error: "Só é possível ajustar cadastros pendentes." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    if ("referredByCedenteId" in body) {
      const referrerId =
        body.referredByCedenteId === null || body.referredByCedenteId === ""
          ? null
          : String(body.referredByCedenteId);
      await syncPendingReferral({ referredCedenteId: id, referrerCedenteId: referrerId });
    }

    const data: Record<string, unknown> = {};

    if ("ownerId" in body) {
      const ownerId = String(body.ownerId || "").trim();
      if (!ownerId) {
        return NextResponse.json({ ok: false, error: "Funcionário inválido." }, { status: 400 });
      }
      const owner = await prisma.user.findFirst({
        where: { id: ownerId, isActive: true },
        select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ ok: false, error: "Funcionário não encontrado ou inativo." }, { status: 400 });
      }
      data.ownerId = ownerId;
    }

    const nextFlags = {
      latamCreacaoPendente: cedente.latamCreacaoPendente,
      smilesCreacaoPendente: cedente.smilesCreacaoPendente,
      liveloCreacaoPendente: cedente.liveloCreacaoPendente,
    };

    if ("latamCreacaoPendente" in body) nextFlags.latamCreacaoPendente = Boolean(body.latamCreacaoPendente);
    if ("smilesCreacaoPendente" in body) nextFlags.smilesCreacaoPendente = Boolean(body.smilesCreacaoPendente);
    if ("liveloCreacaoPendente" in body) nextFlags.liveloCreacaoPendente = Boolean(body.liveloCreacaoPendente);

    if (
      "latamCreacaoPendente" in body ||
      "smilesCreacaoPendente" in body ||
      "liveloCreacaoPendente" in body
    ) {
      Object.assign(
        data,
        deriveProgramCreacaoFlags({
          senhaLatamPass: cedente.senhaLatamPass,
          senhaSmiles: cedente.senhaSmiles,
          senhaLivelo: cedente.senhaLivelo,
          ...nextFlags,
        })
      );
    }

    const updated =
      Object.keys(data).length > 0
        ? await prisma.cedente.update({
            where: { id },
            data,
            select: {
              id: true,
              ownerId: true,
              referredByCedenteId: true,
              latamCreacaoPendente: true,
              smilesCreacaoPendente: true,
              liveloCreacaoPendente: true,
              referredByCedente: {
                select: { id: true, identificador: true, nomeCompleto: true },
              },
              owner: { select: { id: true, name: true, login: true } },
            },
          })
        : await prisma.cedente.findUnique({
            where: { id },
            select: {
              id: true,
              ownerId: true,
              referredByCedenteId: true,
              latamCreacaoPendente: true,
              smilesCreacaoPendente: true,
              liveloCreacaoPendente: true,
              referredByCedente: {
                select: { id: true, identificador: true, nomeCompleto: true },
              },
              owner: { select: { id: true, name: true, login: true } },
            },
          });

    return NextResponse.json({ ok: true, data: updated }, { headers: noCacheHeaders() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCacheHeaders() });
  }
}
