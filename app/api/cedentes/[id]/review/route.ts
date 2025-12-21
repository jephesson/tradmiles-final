// app/api/cedentes/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asInt(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

type Ctx = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = params;
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

    // ✅ sem any (se seu campo status for enum/string, isso compila ok)
    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

    const updated = await prisma.cedente.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById: session.id,

        // ✅ só atualiza pontos quando aprovar (não zera no REJECT)
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

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao revisar" },
      { status: 500 }
    );
  }
}
