import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import {
  clampInt,
  parsePayoutDaysCsv,
  payoutDatesForReferenceMonth,
  payoutDaysToCsv,
  resolveMonthRef,
  toRateioSetting,
} from "@/lib/vip-rateio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePercentToBps(input: unknown, fallbackBps: number) {
  if (input === null || input === undefined || input === "") return fallbackBps;

  if (typeof input === "number" && Number.isFinite(input)) {
    return clampInt(Math.round(input * 100), 0, 10000);
  }

  const raw = String(input).trim();
  if (!raw) return fallbackBps;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return fallbackBps;
  return clampInt(Math.round(value * 100), 0, 10000);
}

function parseDaysInput(input: unknown) {
  if (Array.isArray(input)) {
    return parsePayoutDaysCsv(input.join(","));
  }
  return parsePayoutDaysCsv(String(input ?? ""));
}

export async function GET(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const settingRow = await prisma.vipWhatsappRateioSetting.upsert({
      where: { team },
      create: { team },
      update: {},
      select: {
        ownerPercentBps: true,
        othersPercentBps: true,
        taxPercentBps: true,
        payoutDaysCsv: true,
        updatedAt: true,
      },
    });

    const setting = toRateioSetting(settingRow);
    const month = resolveMonthRef(new URL(req.url).searchParams.get("month"));
    const payoutDates = payoutDatesForReferenceMonth(
      month.monthRef,
      setting.payoutDays
    ).map((d) => d.toISOString());

    return NextResponse.json({
      ok: true,
      data: {
        monthRef: month.monthRef,
        setting: {
          ownerPercent: setting.ownerPercentBps / 100,
          othersPercent: setting.othersPercentBps / 100,
          taxPercent: setting.taxPercentBps / 100,
          payoutDays: setting.payoutDays,
          updatedAt: settingRow.updatedAt.toISOString(),
        },
        payoutDates,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao carregar configuração de rateio.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String(sess.team || "");
    if (!team) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    const current = await prisma.vipWhatsappRateioSetting.upsert({
      where: { team },
      create: { team },
      update: {},
      select: {
        ownerPercentBps: true,
        othersPercentBps: true,
        taxPercentBps: true,
        payoutDaysCsv: true,
      },
    });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const ownerPercentBps = parsePercentToBps(
      body.ownerPercent,
      current.ownerPercentBps
    );
    const othersPercentBps = parsePercentToBps(
      body.othersPercent,
      current.othersPercentBps
    );
    const taxPercentBps = parsePercentToBps(body.taxPercent, current.taxPercentBps);
    const payoutDays = parseDaysInput(body.payoutDays ?? current.payoutDaysCsv);

    if (ownerPercentBps + othersPercentBps !== 10000) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "A soma do percentual do responsável com o percentual dos outros deve ser 100%.",
        },
        { status: 400 }
      );
    }

    const updated = await prisma.vipWhatsappRateioSetting.upsert({
      where: { team },
      create: {
        team,
        ownerPercentBps,
        othersPercentBps,
        taxPercentBps,
        payoutDaysCsv: payoutDaysToCsv(payoutDays),
      },
      update: {
        ownerPercentBps,
        othersPercentBps,
        taxPercentBps,
        payoutDaysCsv: payoutDaysToCsv(payoutDays),
      },
      select: {
        ownerPercentBps: true,
        othersPercentBps: true,
        taxPercentBps: true,
        payoutDaysCsv: true,
        updatedAt: true,
      },
    });

    const setting = toRateioSetting(updated);

    return NextResponse.json({
      ok: true,
      data: {
        setting: {
          ownerPercent: setting.ownerPercentBps / 100,
          othersPercent: setting.othersPercentBps / 100,
          taxPercent: setting.taxPercentBps / 100,
          payoutDays: setting.payoutDays,
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erro ao salvar configuração de rateio.";
    const status = message === "UNAUTHENTICATED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
