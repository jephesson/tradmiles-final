import { NextResponse } from "next/server";
import { refreshInterPixByCodigo } from "@/lib/inter/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function codigoFromBody(body: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = String(v || "").trim();
    if (s) out.push(s);
  };
  if (Array.isArray(body)) {
    for (const item of body) codigoFromBody(item).forEach(push);
    return out;
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    push(o.codigoSolicitacao);
    if (o.transacaoPix && typeof o.transacaoPix === "object") {
      push((o.transacaoPix as { codigoSolicitacao?: unknown }).codigoSolicitacao);
    }
    if (Array.isArray(o.pix)) {
      for (const item of o.pix) codigoFromBody(item).forEach(push);
    }
  }
  return Array.from(new Set(out));
}

async function handle(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") {
    return new NextResponse(null, { status: 204 });
  }
  const body = await req.json().catch(() => null);
  const codes = codigoFromBody(body);
  for (const code of codes) {
    try {
      await refreshInterPixByCodigo(code);
    } catch {
      // Inter reenvia; não falhar o lote inteiro
    }
  }
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: Request) {
  return handle(req);
}
