import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function cents(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

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
          minSellMilheiroCents: null,
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
      where: { minSellMilheiroCents: { not: null } },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        status: true,
        minSellMilheiroCents: true,
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

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const body = await req.json().catch(() => ({}));
    const cedenteId = String(body?.cedenteId || "").trim();
    const clear = body?.clear === true;
    const minSellMilheiroCents = clear ? null : cents(body?.minSellMilheiroCents);

    if (!cedenteId) return bad("cedenteId obrigatório.");
    if (!clear && (minSellMilheiroCents == null || minSellMilheiroCents <= 0)) {
      return bad("Informe o milheiro mínimo (maior que zero).");
    }

    const ced = await prisma.cedente.findUnique({
      where: { id: cedenteId },
      select: { id: true, status: true },
    });
    if (!ced) return bad("Cedente não encontrado.", 404);
    if (!clear && ced.status !== "APPROVED") {
      return bad("Só é possível adicionar cedentes aprovados.");
    }

    const updated = await prisma.cedente.update({
      where: { id: cedenteId },
      data: { minSellMilheiroCents },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        minSellMilheiroCents: true,
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
