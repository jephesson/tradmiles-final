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

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noCacheHeaders() });
}

type SessionLike = {
  team?: string;
  user?: { team?: string };
};

export async function GET() {
  const session = (await requireSession()) as unknown as SessionLike;

  // ✅ compatível com os dois formatos (session.team OU session.user.team)
  const team = session?.team ?? session?.user?.team;

  if (!team) {
    return bad("Sessão inválida: team não encontrado.", 401);
  }

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
