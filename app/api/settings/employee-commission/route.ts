import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
  DEFAULT_EMPLOYEE_C1_BPS,
  clampBps,
  percentToBonusAboveMetaBps,
  percentToC1Bps,
} from "@/lib/payouts/employeeCommissionRates";
import { settingsGateOpen } from "@/lib/settingsGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePercentInput(v: unknown, opts: { max: number; label: string }) {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > opts.max) {
    return { ok: false as const, error: `${opts.label}: use um valor entre 0 e ${opts.max}%.` };
  }
  return { ok: true as const, value: n };
}

export async function GET(req: NextRequest) {
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

    const row = await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default" },
      update: {},
      select: { employeeC1Bps: true, employeeBonusAboveMetaBps: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        employeeC1Bps: row.employeeC1Bps ?? DEFAULT_EMPLOYEE_C1_BPS,
        employeeBonusAboveMetaBps: row.employeeBonusAboveMetaBps ?? DEFAULT_EMPLOYEE_BONUS_ABOVE_META_BPS,
      },
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    const status = m.includes("cookie") || m.toLowerCase().includes("autenticado") ? 401 : 500;
    return NextResponse.json({ ok: false, error: m || "Erro ao carregar." }, { status });
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

    const c1Parsed = parsePercentInput(body?.employeeC1Percent, { max: 20, label: "C1 (PV sem taxa)" });
    if (!c1Parsed.ok) return NextResponse.json({ ok: false, error: c1Parsed.error }, { status: 400 });

    const bonusParsed = parsePercentInput(body?.employeeBonusAboveMetaPercent, {
      max: 100,
      label: "Bônus sobre excedente da meta",
    });
    if (!bonusParsed.ok) return NextResponse.json({ ok: false, error: bonusParsed.error }, { status: 400 });

    const employeeC1Bps = clampBps(percentToC1Bps(c1Parsed.value), 10000);
    const employeeBonusAboveMetaBps = clampBps(percentToBonusAboveMetaBps(bonusParsed.value), 10000);

    const saved = await prisma.settings.upsert({
      where: { key: "default" },
      create: {
        key: "default",
        employeeC1Bps,
        employeeBonusAboveMetaBps,
      },
      update: { employeeC1Bps, employeeBonusAboveMetaBps },
      select: { employeeC1Bps: true, employeeBonusAboveMetaBps: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        employeeC1Bps: saved.employeeC1Bps,
        employeeBonusAboveMetaBps: saved.employeeBonusAboveMetaBps,
      },
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    const status = m.includes("cookie") || m.toLowerCase().includes("autenticado") ? 401 : 500;
    return NextResponse.json({ ok: false, error: m || "Erro ao salvar." }, { status });
  }
}
