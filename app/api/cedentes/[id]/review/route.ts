// app/api/cedentes/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import {
  processReferralOnApprove,
  processReferralOnReject,
  syncPendingReferral,
} from "@/lib/cedente-referrals";
import { deriveProgramCreacaoFlags } from "@/lib/cedentes/programCreacaoPendente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

// ✅ Next 16 no build do Vercel está exigindo params como Promise
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID ausente" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toUpperCase();

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
    }

    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const p = body?.points || {};
    const pontosLatam = asInt(p?.pontosLatam);
    const pontosSmiles = asInt(p?.pontosSmiles);
    const pontosLivelo = asInt(p?.pontosLivelo);
    const pontosEsfera = asInt(p?.pontosEsfera);

    const current = await prisma.cedente.findUnique({
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
    if (!current) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404 });
    }
    if (current.status !== "PENDING") {
      return NextResponse.json({ ok: false, error: "Este cadastro já foi revisado." }, { status: 400 });
    }

    if (session.role === "admin" && action === "APPROVE") {
      if ("referredByCedenteId" in body) {
        const referrerId =
          body.referredByCedenteId === null || body.referredByCedenteId === ""
            ? null
            : String(body.referredByCedenteId);
        await syncPendingReferral({ referredCedenteId: id, referrerCedenteId: referrerId });
      }

      if (body.ownerId) {
        const ownerId = String(body.ownerId || "").trim();
        const owner = await prisma.user.findFirst({
          where: { id: ownerId, isActive: true, team: session.team },
          select: { id: true },
        });
        if (!owner) {
          return NextResponse.json(
            { ok: false, error: "Funcionário responsável inválido ou inativo." },
            { status: 400 }
          );
        }
        await prisma.cedente.update({ where: { id }, data: { ownerId } });
      }

      if (
        "latamCreacaoPendente" in body ||
        "smilesCreacaoPendente" in body ||
        "liveloCreacaoPendente" in body
      ) {
        const flags = deriveProgramCreacaoFlags({
          senhaLatamPass: current.senhaLatamPass,
          senhaSmiles: current.senhaSmiles,
          senhaLivelo: current.senhaLivelo,
          latamCreacaoPendente:
            "latamCreacaoPendente" in body ? Boolean(body.latamCreacaoPendente) : current.latamCreacaoPendente,
          smilesCreacaoPendente:
            "smilesCreacaoPendente" in body ? Boolean(body.smilesCreacaoPendente) : current.smilesCreacaoPendente,
          liveloCreacaoPendente:
            "liveloCreacaoPendente" in body ? Boolean(body.liveloCreacaoPendente) : current.liveloCreacaoPendente,
        });
        await prisma.cedente.update({ where: { id }, data: flags });
      }
    }

    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById: session.id,
        ...(action === "APPROVE"
          ? { pontosLatam, pontosSmiles, pontosLivelo, pontosEsfera }
          : {}),
      },
      select: {
        id: true,
        status: true,
        reviewedAt: true,
        reviewedById: true,
      },
    });

    if (action === "APPROVE") {
      await processReferralOnApprove(id, session.id);
    } else {
      await processReferralOnReject(id);
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao revisar" },
      { status: 500 }
    );
  }
}
