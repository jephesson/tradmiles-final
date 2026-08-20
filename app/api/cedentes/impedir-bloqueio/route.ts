import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Lista contas com “impedir bloqueio” + busca para adicionar. */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const q = String(req.nextUrl.searchParams.get("q") || "").trim();
    const mode = String(req.nextUrl.searchParams.get("mode") || "list").trim();

    if (mode === "search") {
      if (q.length < 2) {
        return NextResponse.json({ ok: true, rows: [] });
      }
      const digits = q.replace(/\D/g, "");
      const rows = await prisma.cedente.findMany({
        where: {
          status: "APPROVED",
          impedirBloqueioPax: false,
          OR: [
            { nomeCompleto: { contains: q, mode: "insensitive" } },
            { identificador: { contains: q, mode: "insensitive" } },
            ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : []),
          ],
        },
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          cpf: true,
          owner: { select: { name: true, login: true } },
        },
        orderBy: { nomeCompleto: "asc" },
        take: 20,
      });
      return NextResponse.json({ ok: true, rows });
    }

    const rows = await prisma.cedente.findMany({
      where: { impedirBloqueioPax: true },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        status: true,
        owner: { select: { name: true, login: true } },
        updatedAt: true,
      },
      orderBy: { nomeCompleto: "asc" },
      take: 500,
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao carregar.", 500);
  }
}

/** Adiciona ou remove da lista. */
export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json().catch(() => ({}));
    const cedenteId = String(body?.cedenteId || "").trim();
    const enabled = body?.enabled !== false;

    if (!cedenteId) return bad("cedenteId obrigatório.");

    const ced = await prisma.cedente.findUnique({
      where: { id: cedenteId },
      select: { id: true, status: true },
    });
    if (!ced) return bad("Cedente não encontrado.", 404);
    if (enabled && ced.status !== "APPROVED") {
      return bad("Só é possível adicionar cedentes aprovados.");
    }

    const updated = await prisma.cedente.update({
      where: { id: cedenteId },
      data: { impedirBloqueioPax: enabled },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        impedirBloqueioPax: true,
        owner: { select: { name: true, login: true } },
      },
    });

    return NextResponse.json({ ok: true, row: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHENTICATED") return bad("Não autenticado.", 401);
    return bad(msg || "Falha ao salvar.", 500);
  }
}
