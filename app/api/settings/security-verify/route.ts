import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/require-session";
import {
  SETTINGS_GATE_COOKIE,
  SETTINGS_GATE_VALUE,
  expectedSettingsSecurityAnswerNormalized,
  normalizeSettingsSecurityInput,
} from "@/lib/settingsGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const given = normalizeSettingsSecurityInput(String(body?.answer ?? ""));
    const expected = expectedSettingsSecurityAnswerNormalized();

    if (!given || given !== expected) {
      return NextResponse.json({ ok: false, error: "Resposta incorreta." }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: SETTINGS_GATE_COOKIE,
      value: SETTINGS_GATE_VALUE,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60,
      path: "/",
    });
    return res;
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    const status = m.includes("cookie") || m.toLowerCase().includes("autenticado") ? 401 : 500;
    return NextResponse.json({ ok: false, error: m || "Erro." }, { status });
  }
}
