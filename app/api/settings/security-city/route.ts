import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  fallbackSettingsSecurityCity,
  normalizeSettingsSecurityInput,
  settingsGateOpen,
  settingsSecurityCityFromDb,
} from "@/lib/settingsGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function gateDenied() {
  return NextResponse.json(
    {
      ok: false,
      error: "Responda à pergunta de segurança para acessar as configurações.",
      code: "SETTINGS_GATE_REQUIRED",
    },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    if (!settingsGateOpen(req)) return gateDenied();

    const city = await settingsSecurityCityFromDb();
    return NextResponse.json({ ok: true, data: { city } });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    const status = m.includes("cookie") || m.toLowerCase().includes("autenticado") ? 401 : 500;
    return NextResponse.json({ ok: false, error: m || "Erro." }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    if (!settingsGateOpen(req)) return gateDenied();

    const body = await req.json().catch(() => ({}));
    const city = String(body?.city ?? "").trim().replace(/\s+/g, " ");
    const normalized = normalizeSettingsSecurityInput(city);
    if (normalized.length < 3 || normalized.length > 40) {
      return NextResponse.json(
        { ok: false, error: "A palavra-chave precisa ter entre 3 e 40 caracteres." },
        { status: 400 }
      );
    }

    await prisma.settings.upsert({
      where: { key: "default" },
      create: { key: "default", securityCity: city || fallbackSettingsSecurityCity() },
      update: { securityCity: city },
    });

    return NextResponse.json({ ok: true, data: { city } });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    const status = m.includes("cookie") || m.toLowerCase().includes("autenticado") ? 401 : 500;
    return NextResponse.json({ ok: false, error: m || "Erro." }, { status });
  }
}
