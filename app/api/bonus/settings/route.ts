import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { settingsGateOpen } from "@/lib/settingsGate";
import {
  currentMonthISORecife,
  isMonthISO,
  suggestGoalsFromMax,
} from "@/lib/bonus/monthlyBonus";
import { fetchHistoricalMaxForSuggest } from "@/lib/bonus/fetchMonthlyMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseReaisInput(v: unknown, label: string) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false as const, error: `${label}: valor inválido.` };
  }
  return { ok: true as const, cents: Math.round(n * 100) };
}

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== "admin") return bad("Sem permissão.", 403);
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

    const { searchParams } = new URL(req.url);
    const monthParam = String(searchParams.get("month") || "").trim();
    const month = isMonthISO(monthParam) ? monthParam : currentMonthISORecife();

    const [setting, suggest] = await Promise.all([
      prisma.bonusMonthSetting.findUnique({
        where: { team_month: { team: session.team, month } },
      }),
      fetchHistoricalMaxForSuggest(session.team),
    ]);

    const suggested = suggestGoalsFromMax(
      suggest.maxRevenueCents,
      suggest.maxProfitCents
    );

    return NextResponse.json({
      ok: true,
      month,
      data: {
        isActive: setting?.isActive ?? false,
        revenueGoalCents: setting?.revenueGoalCents ?? 0,
        profitGoalCents: setting?.profitGoalCents ?? 0,
      },
      suggest: {
        maxRevenueCents: suggest.maxRevenueCents,
        maxProfitCents: suggest.maxProfitCents,
        revenueGoalCents: suggested.revenueGoalCents,
        profitGoalCents: suggested.profitGoalCents,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      msg.includes("cookie") || msg.toLowerCase().includes("autenticado") ? 401 : 500;
    return bad(msg || "Erro ao carregar.", status);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== "admin") return bad("Sem permissão.", 403);
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
    const month = String(body?.month || "").trim();
    if (!isMonthISO(month)) return bad("Mês inválido. Use YYYY-MM.");

    const revenueParsed = parseReaisInput(body?.revenueGoalReais, "Meta de faturamento");
    if (!revenueParsed.ok) return bad(revenueParsed.error);
    const profitParsed = parseReaisInput(body?.profitGoalReais, "Meta de lucro líquido");
    if (!profitParsed.ok) return bad(profitParsed.error);

    const isActive = Boolean(body?.isActive);

    const saved = await prisma.bonusMonthSetting.upsert({
      where: { team_month: { team: session.team, month } },
      create: {
        team: session.team,
        month,
        isActive,
        revenueGoalCents: revenueParsed.cents,
        profitGoalCents: profitParsed.cents,
      },
      update: {
        isActive,
        revenueGoalCents: revenueParsed.cents,
        profitGoalCents: profitParsed.cents,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        month: saved.month,
        isActive: saved.isActive,
        revenueGoalCents: saved.revenueGoalCents,
        profitGoalCents: saved.profitGoalCents,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      msg.includes("cookie") || msg.toLowerCase().includes("autenticado") ? 401 : 500;
    return bad(msg || "Erro ao salvar.", status);
  }
}
