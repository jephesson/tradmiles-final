import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveVendorCommissionBps, DEFAULT_VENDOR_COMMISSION_BPS } from "@/lib/purchases/vendorCommission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

/** Defaults de compra — leitura para qualquer usuário autenticado (sem gate de config). */
export async function GET() {
  try {
    const store = await cookies();
    const session = readSessionCookie(store.get("tm.session")?.value);
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const vendorCommissionBps = await resolveVendorCommissionBps();
    return NextResponse.json({
      ok: true,
      data: {
        vendorCommissionBps,
        vendorCommissionPercent: vendorCommissionBps / 100,
        defaultVendorCommissionBps: DEFAULT_VENDOR_COMMISSION_BPS,
      },
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "";
    return NextResponse.json({ ok: false, error: m || "Erro ao carregar." }, { status: 500 });
  }
}
