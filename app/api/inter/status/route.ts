import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { interConfigured, interPublicBaseUrl } from "@/lib/inter/config";
import { registerInterPixWebhook } from "@/lib/inter/pix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    configured: interConfigured(),
    webhookUrl: interPublicBaseUrl()
      ? `${interPublicBaseUrl()}/api/webhooks/inter`
      : null,
  });
}

export async function POST() {
  let sess;
  try {
    sess = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  if (sess.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }
  if (!interConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Configure INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT e INTER_KEY." },
      { status: 400 }
    );
  }
  const base = interPublicBaseUrl();
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "Configure NEXT_PUBLIC_APP_URL com o domínio https da Vercel." },
      { status: 400 }
    );
  }
  try {
    await registerInterPixWebhook(`${base}/api/webhooks/inter`);
    return NextResponse.json({ ok: true, webhookUrl: `${base}/api/webhooks/inter` });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Falha ao cadastrar webhook." },
      { status: 400 }
    );
  }
}
