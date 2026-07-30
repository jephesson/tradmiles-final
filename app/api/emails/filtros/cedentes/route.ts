import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Teto de opções devolvidas ao seletor de cedente. */
const MAX_RESULTS = 300;

export async function GET(req: Request) {
  try {
    requireSession(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const search = (url.searchParams.get("q") || "").trim();

  const rows = await prisma.cedente.findMany({
    where: {
      emailCriado: { not: null },
      ...(search
        ? {
            OR: [
              { nomeCompleto: { contains: search, mode: "insensitive" as const } },
              { identificador: { contains: search, mode: "insensitive" as const } },
              { emailCriado: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      emailCriado: true,
    },
    orderBy: { nomeCompleto: "asc" },
    take: MAX_RESULTS,
  });

  const options = rows
    .map((r) => ({
      id: r.id,
      identificador: r.identificador,
      nomeCompleto: r.nomeCompleto,
      email: String(r.emailCriado || "").trim().toLowerCase(),
    }))
    .filter((r) => r.email.includes("@"));

  return NextResponse.json({ ok: true, options, capped: rows.length >= MAX_RESULTS });
}
