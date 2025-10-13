// app/api/comissoes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // ajuste para "@/lib/prisma" se for o seu caso
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

type Status = "pago" | "aguardando";

/* ============== GET ============== */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim() as Status | "";

    const where: Prisma.ComissaoWhereInput = {};

    if (statusParam) {
      where.status = statusParam;
    }

    if (q) {
      where.OR = [
        { cedenteNome: { contains: q, mode: "insensitive" } },
        { compraId: { contains: q, mode: "insensitive" } },
      ];
    }

    const data = await prisma.comissao.findMany({
      where,
      orderBy: { criadoEm: "desc" },
    });

    return NextResponse.json({ ok: true, data }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao carregar comissões";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/* ============== POST ==============
Body aceito:
{
  "compraId": string,
  "cedenteId": string,
  "cedenteNome"?: string,
  "valor": number | string,
  "status"?: "pago" | "aguardando"
}
Salva/upserta pela única (compraId, cedenteId)
==================================== */
type PostBody = {
  compraId: string;
  cedenteId: string;
  cedenteNome?: string | null;
  valor: number | string;
  status?: Status | "";
};

function toDecimal(v: unknown): Prisma.Decimal {
  if (typeof v === "number" && Number.isFinite(v)) return new Prisma.Decimal(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return new Prisma.Decimal(v);
  }
  return new Prisma.Decimal(0);
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await req.json();
    const body: Partial<PostBody> = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<PostBody>;

    const compraId = String(body.compraId ?? "").trim();
    const cedenteId = String(body.cedenteId ?? "").trim();
    if (!compraId || !cedenteId) {
      return NextResponse.json(
        { ok: false, error: "compraId e cedenteId são obrigatórios" },
        { status: 400, headers: noCache() }
      );
    }

    const cedenteNome = (body.cedenteNome ?? "") || "";
    const valor = toDecimal(body.valor);
    const status: Status = body.status === "pago" ? "pago" : "aguardando";

    const data = await prisma.comissao.upsert({
      where: { compraId_cedenteId: { compraId, cedenteId } },
      update: {
        cedenteNome,
        valor, // Decimal
        status,
        atualizadoEm: new Date(),
      },
      create: {
        compraId,
        cedenteId,
        cedenteNome,
        valor, // Decimal
        status,
      },
    });

    return NextResponse.json({ ok: true, data }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao salvar comissão";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
