import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { settingsGateOpen } from "@/lib/settingsGate";
import {
  canUseIndividualBonus,
  currentMonthISORecife,
  isMonthISO,
  previousMonthISO,
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

    const [setting, suggest, users, goals] = await Promise.all([
      prisma.bonusMonthSetting.findUnique({
        where: { team_month: { team: session.team, month } },
      }),
      fetchHistoricalMaxForSuggest(session.team),
      prisma.user.findMany({
        where: { team: session.team, isActive: true, role: { in: ["admin", "staff"] } },
        select: { id: true, name: true, login: true },
        orderBy: { name: "asc" },
      }),
      canUseIndividualBonus(month)
        ? prisma.employeeMonthGoal.findMany({
            where: { team: session.team, month },
          })
        : Promise.resolve([]),
    ]);

    let goalRows = goals;
    let individualCopiedFrom: string | null = null;
    if (canUseIndividualBonus(month) && !goalRows.length) {
      const prevMonth = previousMonthISO(month);
      if (canUseIndividualBonus(prevMonth)) {
        const prevGoals = await prisma.employeeMonthGoal.findMany({
          where: { team: session.team, month: prevMonth },
        });
        if (prevGoals.length) {
          goalRows = prevGoals;
          individualCopiedFrom = prevMonth;
        }
      }
    }
    const goalByUser = new Map(goalRows.map((g) => [g.userId, g]));

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
        individualEnabled: canUseIndividualBonus(month),
        individualCopiedFrom,
        employees: users.map((u) => ({
          userId: u.id,
          name: u.name,
          login: u.login,
          salesGoalCents: goalByUser.get(u.id)?.salesGoalCents ?? 0,
          bonusCents: goalByUser.get(u.id)?.bonusCents ?? 0,
          recruitGoalCount: goalByUser.get(u.id)?.recruitGoalCount ?? 0,
          recruitBonusCents: goalByUser.get(u.id)?.recruitBonusCents ?? 0,
        })),
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

    const employeesRaw = Array.isArray(body?.employees) ? body.employees : [];
    if (employeesRaw.length && !canUseIndividualBonus(month)) {
      return bad("Meta individual vale a partir de novembro de 2026.");
    }

    const employeeRows: Array<{
      userId: string;
      salesGoalCents: number;
      bonusCents: number;
      recruitGoalCount: number;
      recruitBonusCents: number;
    }> = [];
    if (canUseIndividualBonus(month)) {
      for (const row of employeesRaw) {
        const userId = String(row?.userId || "").trim();
        if (!userId) continue;
        const salesParsed = parseReaisInput(row?.salesGoalReais, "Meta individual");
        if (!salesParsed.ok) return bad(salesParsed.error);
        const bonusParsed = parseReaisInput(row?.bonusReais, "Bônus individual");
        if (!bonusParsed.ok) return bad(bonusParsed.error);
        const recruitCountRaw = Number(String(row?.recruitGoalCount ?? "0").replace(",", "."));
        if (!Number.isFinite(recruitCountRaw) || recruitCountRaw < 0) {
          return bad("Meta de recrutamento: quantidade inválida.");
        }
        const recruitBonusParsed = parseReaisInput(row?.recruitBonusReais, "Bônus de recrutamento");
        if (!recruitBonusParsed.ok) return bad(recruitBonusParsed.error);
        employeeRows.push({
          userId,
          salesGoalCents: salesParsed.cents,
          bonusCents: bonusParsed.cents,
          recruitGoalCount: Math.trunc(recruitCountRaw),
          recruitBonusCents: recruitBonusParsed.cents,
        });
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      const settingRow = await tx.bonusMonthSetting.upsert({
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
      for (const row of employeeRows) {
        await tx.employeeMonthGoal.upsert({
          where: {
            team_month_userId: { team: session.team, month, userId: row.userId },
          },
          create: {
            team: session.team,
            month,
            userId: row.userId,
            salesGoalCents: row.salesGoalCents,
            bonusCents: row.bonusCents,
            recruitGoalCount: row.recruitGoalCount,
            recruitBonusCents: row.recruitBonusCents,
          },
          update: {
            salesGoalCents: row.salesGoalCents,
            bonusCents: row.bonusCents,
            recruitGoalCount: row.recruitGoalCount,
            recruitBonusCents: row.recruitBonusCents,
          },
        });
      }
      return settingRow;
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
