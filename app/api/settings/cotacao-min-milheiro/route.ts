import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { requireSession } from "@/lib/require-session";
import { settingsGateOpen } from "@/lib/settingsGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reaisToCents(v: unknown) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return Math.round(n * 100);
}

export async function GET() {
  try {
    const sess = await getSessionServer();
    if (!sess) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    const row = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: {
        cotacaoMinMilheiroLatamCents: true,
        cotacaoMinMilheiroSmilesCents: true,
        cotacaoMinMilheiroAzulCents: true,
      },
    });
    return NextResponse.json({
      ok: true,
      data: {
        latam: row.cotacaoMinMilheiroLatamCents || 0,
        smiles: row.cotacaoMinMilheiroSmilesCents || 0,
        azul: row.cotacaoMinMilheiroAzulCents || 0,
      },
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ ok: false, error: m || "Erro ao carregar." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    if (!settingsGateOpen(req)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Responda à pergunta de segurança para acessar as configurações.",
          code: "SETTINGS_GATE_REQUIRED",
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const latam = reaisToCents(body?.latam);
    const smiles = reaisToCents(body?.smiles);
    const azul = reaisToCents(body?.azul);
    if (latam == null || smiles == null || azul == null) {
      return NextResponse.json(
        { ok: false, error: "Informe o milheiro mínimo de cada cia (R$ 0 a 1.000)." },
        { status: 400 }
      );
    }

    const saved = await prisma.settings.upsert({
      where: { key: "default" },
      create: {
        key: "default",
        cotacaoMinMilheiroLatamCents: latam,
        cotacaoMinMilheiroSmilesCents: smiles,
        cotacaoMinMilheiroAzulCents: azul,
      },
      update: {
        cotacaoMinMilheiroLatamCents: latam,
        cotacaoMinMilheiroSmilesCents: smiles,
        cotacaoMinMilheiroAzulCents: azul,
      },
      select: {
        cotacaoMinMilheiroLatamCents: true,
        cotacaoMinMilheiroSmilesCents: true,
        cotacaoMinMilheiroAzulCents: true,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        latam: saved.cotacaoMinMilheiroLatamCents,
        smiles: saved.cotacaoMinMilheiroSmilesCents,
        azul: saved.cotacaoMinMilheiroAzulCents,
      },
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    const status = m.toLowerCase().includes("autenticado") ? 401 : 500;
    return NextResponse.json({ ok: false, error: m || "Erro ao salvar." }, { status });
  }
}
