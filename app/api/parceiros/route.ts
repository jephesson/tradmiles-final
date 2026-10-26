import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildWhatsAppLink } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TEAM = "@vias_aereas";
const MIN_LATAM_PTS = 2000;
const ONLINE_WINDOW_MS = 3 * 60 * 1000;
const WA_TEXT =
  "Olá! Vi a página de parceiros da Vias Aéreas e quero falar sobre pontos LATAM.";

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
  try {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);

    const [stock, staff] = await Promise.all([
      prisma.cedente.aggregate({
        where: {
          status: "APPROVED",
          pontosLatam: { gte: MIN_LATAM_PTS },
          owner: { team: TEAM },
        },
        _sum: { pontosLatam: true },
        _max: { pontosLatam: true },
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          team: TEAM,
          role: { in: ["staff", "admin"] },
          lastPresenceAt: { gte: since },
        },
        select: { whatsapp: true, lastPresenceAt: true },
        orderBy: { lastPresenceAt: "desc" },
      }),
    ]);

    const online = staff.map((u, i) => {
      const wa = (u.whatsapp || "").replace(/\D/g, "");
      return {
        label: `Atendente ${i + 1}`,
        whatsappUrl: wa ? buildWhatsAppLink(wa, WA_TEXT) : null,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          latam: {
            maxAccount: stock._max.pontosLatam ?? 0,
            total: stock._sum.pontosLatam ?? 0,
            minAccountThreshold: MIN_LATAM_PTS,
          },
          online,
        },
      },
      { headers: noCacheHeaders() }
    );
  } catch (e: any) {
    console.error("Erro GET /api/parceiros:", e);
    return NextResponse.json(
      { ok: false, error: "Não foi possível carregar os dados." },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
