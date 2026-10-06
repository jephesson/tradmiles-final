import { NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth-server";
import {
  buildCedenteCommissionWhatsApp,
  loadCedenteCommissionReceipt,
} from "@/lib/pix/cedenteCommissionReceipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const row = await loadCedenteCommissionReceipt(id);
  if (!row) {
    return NextResponse.json({ ok: false, error: "Comissão não encontrada." }, { status: 404 });
  }

  const wa = buildCedenteCommissionWhatsApp(row);
  return NextResponse.json({
    ok: true,
    message: wa.message,
    whatsappUrl: wa.whatsappUrl,
    hasWhatsapp: Boolean(wa.e164),
  });
}
