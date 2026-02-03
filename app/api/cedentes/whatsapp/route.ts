// app/api/cedentes/whatsapp/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { buildWhatsAppLink, normalizeBRPhoneToE164 } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

export async function GET() {
  const session = await requireSession();

  // Ajuste conforme seu session (team / userId).
  const team = session.user.team;

  const cedentes = await prisma.cedente.findMany({
    where: { owner: { team } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      telefone: true,
      status: true,
      createdAt: true,
      owner: { select: { name: true, login: true } },
    },
  });

  const rows = cedentes.map((c) => {
    const e164 = normalizeBRPhoneToE164(c.telefone);
    return {
      ...c,
      whatsappE164: e164,
      whatsappUrl: e164 ? buildWhatsAppLink(e164) : null,
    };
  });

  return NextResponse.json({ ok: true, rows }, { headers: noCacheHeaders() });
}
