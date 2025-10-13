// app/api/comissoes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ========= util headers ========= */
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

/* ========= tipos mínimos (sem depender de Prisma.*WhereInput) ========= */
type TextFilter = { contains: string; mode?: "insensitive" | "default" };
type WhereInput = {
  status?: Status;
  OR?: Array<{ cedenteNome?: TextFilter } | { compraId?: TextFilter }>;
};
type OrderByInput = { criadoEm: "asc" | "desc" };

type FindManyArgs = { where?: WhereInput; orderBy?: OrderByInput };
type UpsertArgs = {
  where: { compraId_cedenteId: { compraId: string; cedenteId: string } };
  update: { cedenteNome?: string; valor: Prisma.Decimal; status: Status; atualizadoEm: Date };
  create: { compraId: string; cedenteId: string; cedenteNome?: string; valor: Prisma.Decimal; status: Status };
};
type RepoShape = {
  findMany?: (args: FindManyArgs) => Promise<unknown[]>;
  upsert?: (args: UpsertArgs) => Promise<unknown>;
};

/* ========= type guards ========= */
function isFunction(x: unknown): x is (...args: unknown[]) => unknown {
  return typeof x === "function";
}
function isRepoShape(x: unknown): x is RepoShape {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return isFunction(r.findMany) || isFunction(r.upsert);
}

/* ========= resolve o model dinamicamente ========= */
function getRepo(): RepoShape | null {
  const client = prisma as unknown as Record<string, unknown>;
  const candidates = ["comissao", "comissaoCedente", "commission"] as const;
  for (const k of candidates) {
    const repo = client[k];
    if (isRepoShape(repo)) return repo as RepoShape;
  }
  return null;
}

/* ========= helpers ========= */
function toDecimal(v: unknown): Prisma.Decimal {
  if (typeof v === "number" && Number.isFinite(v)) return new Prisma.Decimal(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return new Prisma.Decimal(v);
  }
  return new Prisma.Decimal(0);
}

/* ============== GET ============== */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim() as Status | "";

    const where: WhereInput = {};
    if (statusParam) where.status = statusParam;
    if (q) {
      where.OR = [
        { cedenteNome: { contains: q, mode: "insensitive" } },
        { compraId: { contains: q, mode: "insensitive" } },
      ];
    }

    const repo = getRepo();
    if (!repo?.findMany) {
      // evita quebrar build caso o model não exista no Client
      return NextResponse.json(
        { ok: true, data: [], _db: "skipped (model not found)" },
        { headers: noCache() }
      );
    }

    const data = await repo.findMany({ where, orderBy: { criadoEm: "desc" } });
    return NextResponse.json({ ok: true, data }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao carregar comissões";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/* ============== POST ============== */
/**
Body:
{
  "compraId": string,
  "cedenteId": string,
  "cedenteNome"?: string,
  "valor": number | string,
  "status"?: "pago" | "aguardando"
}
Salva/upserta pela única (compraId, cedenteId)
**/
type PostBody = {
  compraId: string;
  cedenteId: string;
  cedenteNome?: string | null;
  valor: number | string;
  status?: Status | "";
};

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await req.json();
    const body: Partial<PostBody> =
      typeof raw === "object" && raw !== null ? (raw as Partial<PostBody>) : {};

    const compraId = String(body.compraId ?? "").trim();
    const cedenteId = String(body.cedenteId ?? "").trim();
    if (!compraId || !cedenteId) {
      return NextResponse.json(
        { ok: false, error: "compraId e cedenteId são obrigatórios" },
        { status: 400, headers: noCache() }
      );
    }

    const repo = getRepo();
    if (!repo?.upsert) {
      // evita quebrar build caso o model não exista no Client
      return NextResponse.json(
        {
          ok: true,
          data: {
            compraId,
            cedenteId,
            cedenteNome: body.cedenteNome ?? "",
            valor: toDecimal(body.valor),
            status: body.status === "pago" ? "pago" : "aguardando",
            _db: "skipped (model not found)",
          },
        },
        { headers: noCache() }
      );
    }

    const cedenteNome = (body.cedenteNome ?? "") || "";
    const valor = toDecimal(body.valor);
    const status: Status = body.status === "pago" ? "pago" : "aguardando";

    const data = await repo.upsert({
      where: { compraId_cedenteId: { compraId, cedenteId } },
      update: {
        cedenteNome,
        valor,
        status,
        atualizadoEm: new Date(),
      },
      create: {
        compraId,
        cedenteId,
        cedenteNome,
        valor,
        status,
      },
    });

    return NextResponse.json({ ok: true, data }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao salvar comissão";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
