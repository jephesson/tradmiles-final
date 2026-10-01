import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  computeDailyRevenueTargetCents,
  currentMonthISORecife,
  daysRemainingInMonth,
  isFirstDayOfMonth,
  monthLabelPT,
  previousMonthISO,
} from "@/lib/bonus/monthlyBonus";
import {
  fetchMonthlyBonusMetrics,
  fetchTodayBonusRevenue,
} from "@/lib/bonus/fetchMonthlyMetrics";
import { ensureDueCardCashbacks } from "@/lib/card-cashback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 3 * 60 * 1000;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function todayRecifeISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nowMinutesRecife(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}

function fmtMin(min: number) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${hh}:${m}`;
}

function isoToLongLabel(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** Ponto no tempo está em [start, end) ? */
function inHalfOpenRange(t: number, start: number, end: number) {
  return t >= start && t < end;
}

export async function GET() {
  try {
    const session = await requireSession();
    const todayISO = todayRecifeISO();
    const nowMin = nowMinutesRecife();
    await ensureDueCardCashbacks(session.team, todayISO);

    const bonusMonth = currentMonthISORecife();
    const prevMonthKey = isFirstDayOfMonth(todayISO) ? previousMonthISO(bonusMonth) : null;

    const [events, users, bonusSetting, bonusMetrics, todayRevenue, prevBonusSetting, prevBonusMetrics] =
      await Promise.all([
      prisma.agendaEvent.findMany({
        where: {
          team: session.team,
          status: "ACTIVE",
          dateISO: todayISO,
        },
        include: {
          user: { select: { id: true, name: true, login: true } },
        },
        orderBy: [{ startMin: "asc" }, { userId: "asc" }],
      }),
      prisma.user.findMany({
        where: { team: session.team },
        select: { id: true, name: true, login: true, lastPresenceAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.bonusMonthSetting.findUnique({
        where: {
          team_month: { team: session.team, month: bonusMonth },
        },
        select: {
          isActive: true,
          revenueGoalCents: true,
          profitGoalCents: true,
        },
      }),
      fetchMonthlyBonusMetrics(session.team, bonusMonth),
      fetchTodayBonusRevenue(session.team, todayISO),
      prevMonthKey
        ? prisma.bonusMonthSetting.findUnique({
            where: {
              team_month: { team: session.team, month: prevMonthKey },
            },
            select: { revenueGoalCents: true },
          })
        : Promise.resolve(null),
      prevMonthKey
        ? fetchMonthlyBonusMetrics(session.team, prevMonthKey)
        : Promise.resolve(null),
    ]);

    const now = Date.now();

    const agendaToday = events.map((e) => ({
      id: e.id,
      type: e.type as "SHIFT" | "ABSENCE",
      startHHMM: fmtMin(e.startMin),
      endHHMM: fmtMin(e.endMin),
      startMin: e.startMin,
      endMin: e.endMin,
      note: e.note || "",
      user: e.user,
    }));

    const byUser = new Map<string, typeof agendaToday>();
    for (const row of agendaToday) {
      const uid = row.user.id;
      const arr = byUser.get(uid) || [];
      arr.push(row);
      byUser.set(uid, arr);
    }

    const expectedShiftEventIds: string[] = [];

    for (const u of users) {
      const list = byUser.get(u.id) || [];
      const absentNow = list.some(
        (e) => e.type === "ABSENCE" && inHalfOpenRange(nowMin, e.startMin, e.endMin)
      );
      if (absentNow) continue;

      const shiftNow = list.find(
        (e) => e.type === "SHIFT" && inHalfOpenRange(nowMin, e.startMin, e.endMin)
      );
      if (shiftNow) expectedShiftEventIds.push(shiftNow.id);
    }

    const teamPresence = users.map((u) => {
      const t = u.lastPresenceAt ? new Date(u.lastPresenceAt).getTime() : 0;
      const online = t > 0 && now - t <= ONLINE_WINDOW_MS;
      return {
        id: u.id,
        name: u.name,
        login: u.login,
        online,
        lastPresenceAt: u.lastPresenceAt ? u.lastPresenceAt.toISOString() : null,
      };
    });

    const revenueGoalCents = bonusSetting?.revenueGoalCents ?? 0;
    const revenueCents = bonusMetrics.revenueCents;
    const revenueGoalMet = revenueGoalCents > 0 && revenueCents >= revenueGoalCents;
    const daysRemaining = daysRemainingInMonth(bonusMonth, todayISO);
    const dailyTargetCents = computeDailyRevenueTargetCents({
      revenueGoalCents,
      revenueCents,
      daysRemaining,
    });
    const todayRevenueCents = todayRevenue.revenueCents;
    const todayVsDailyPct =
      dailyTargetCents > 0
        ? Math.min(100, Math.round((todayRevenueCents / dailyTargetCents) * 100))
        : revenueGoalMet
          ? 100
          : 0;
    const monthRevenuePct =
      revenueGoalCents > 0
        ? Math.min(100, Math.round((revenueCents / revenueGoalCents) * 100))
        : 0;

    const prevGoalCents = prevBonusSetting?.revenueGoalCents ?? 0;
    const prevRevenueCents = prevBonusMetrics?.revenueCents ?? 0;
    const previousMonthProgress =
      prevMonthKey && prevBonusMetrics
        ? {
            month: prevMonthKey,
            monthLabel: monthLabelPT(prevMonthKey),
            revenueGoalCents: prevGoalCents,
            revenueCents: prevRevenueCents,
            revenueGoalMet: prevGoalCents > 0 && prevRevenueCents >= prevGoalCents,
          }
        : null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          todayISO,
          todayLabel: isoToLongLabel(todayISO),
          nowHHMM: fmtMin(nowMin),
          agendaToday,
          expectedShiftEventIds,
          teamPresence,
          bonusProgress: {
            month: bonusMonth,
            monthLabel: monthLabelPT(bonusMonth),
            isActive: bonusSetting?.isActive ?? false,
            revenueGoalCents,
            revenueCents,
            revenueGoalMet,
            monthRevenuePct,
            daysRemaining,
            dailyTargetCents,
            todayRevenueCents,
            todayVsDailyPct,
            todaySalesCount: todayRevenue.salesCount,
            todayBalcaoCount: todayRevenue.balcaoCount,
            isRenewalDay: Boolean(prevMonthKey),
            previousMonth: previousMonthProgress,
          },
        },
      },
      { headers: noCache() }
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCache() });
    }
    return NextResponse.json(
      { ok: false, error: msg || "Erro ao carregar página inicial." },
      { status: 500, headers: noCache() }
    );
  }
}
