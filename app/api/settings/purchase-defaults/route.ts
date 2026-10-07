import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { resolveVendorCommissionBps, DEFAULT_VENDOR_COMMISSION_BPS } from "@/lib/purchases/vendorCommission";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" | "socio" };



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
