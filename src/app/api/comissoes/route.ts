// src/app/api/comissoes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

/* ========= tipos mínimos ========= */
type TextFilter = { contains: string; mode?: "insensitive" | "default" };
type WhereInput = {
  compraId?: string;
  cedenteId?: string;
  status?: Status;
  OR?: Array<{ cedenteNome?: TextFilter } | { compraId?: TextFilter }>;
};
type OrderByInput = { criadoEm?: "asc" | "desc"; atualizadoEm?: "asc" | "desc" };

type FindManyArgs = {
  where?: WhereInput;
  orderBy?: OrderByInput;
  skip?: number;
  take?: number;
};
type UpsertArgs = {
  where: { compraId_cedenteId: { compraId: string; cedenteId: string } };
  update: { cedenteNome?: string; valor?: Prisma.Decimal; status?: Status; atualizadoEm?: Date };
  create: { compraId: string; cedenteId: string; cedenteNome?: string; valor: Prisma.Decimal; status: Status };
};
type UpdateArgs = {
  where: { compraId_cedenteId: { compraId: string; cedenteId: string } };
  data: { cedenteNome?: string; valor?: Prisma.Decimal; status?: Status; atualizadoEm?: Date };
};
type DeleteArgs = {
  where: { compraId_cedenteId: { compraId: string; cedenteId: string } };
};
type CountArgs = { where?: WhereInput };
type RepoShape = {
  findMany?: (args: FindManyArgs) => Promise<unknown[]>;
  upsert?: (args: UpsertArgs) => Promise<unknown>;
  update?: (args: UpdateArgs) => Promise<unknown>;
  delete?: (args: DeleteArgs) => Promise<unknown>;
  count?: (args: CountArgs) => Promise<number>;
};

/* ========= type guards ========= */
function isFunction(x: unknown): x is (...args: any[]) => any {
  return typeof x === "function";
}
function isRepoShape(x: unknown): x is RepoShape {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    isFunction(r.findMany) ||
    isFunction(r.upsert) ||
    isFunction(r.update) ||
    isFunction(r.delete) ||
    isFunction(r.count)
  );
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
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return new Prisma.Decimal(v);
  return new Prisma.Decimal(0);
}

/* ============== GET (listagem/consulta) ============== */
/**
Query params aceitos:
- q: busca em cedenteNome/compraId
- status: "pago" | "aguardando"
- compraId, cedenteId: filtros diretos
- offset (default 0), limit (default 50; máx 500)
- order: "criado-desc" | "criado-asc" | "atualizado-desc" | "atualizado-asc"
*/
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim() as Status | "";
    const compraIdParam = (searchParams.get("compraId") || "").trim();
    const cedenteIdParam = (searchParams.get("cedenteId") || "").trim();

    const offsetRaw = Number(searchParams.get("offset") || "0");
    const limitRaw = Number(searchParams.get("limit") || "50");
    const orderParam = (searchParams.get("order") || "criado-desc").trim();

    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 50, 500));

    const where: WhereInput = {};
    if (statusParam) where.status = statusParam;
    if (compraIdParam) where.compraId = compraIdParam;
    if (cedenteIdParam) where.cedenteId = cedenteIdParam;
    if (q) {
      where.OR = [
        { cedenteNome: { contains: q, mode: "insensitive" } },
        { compraId: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy: OrderByInput =
      orderParam === "criado-asc"
        ? { criadoEm: "asc" }
        : orderParam === "atualizado-desc"
        ? { atualizadoEm: "desc" }
        : orderParam === "atualizado-asc"
        ? { atualizadoEm: "asc" }
        : { criadoEm: "desc" };

    const repo = getRepo();
    if (!repo?.findMany) {
      return NextResponse.json(
        { ok: true, data: [], total: 0, offset, limit, _db: "skipped (model not found)" },
        { headers: noCache() }
      );
    }

    const [total, data] = await Promise.all([
      repo.count ? repo.count({ where }) : Promise.resolve(0),
      repo.findMany({ where, orderBy, skip: offset, take: limit }),
    ]);

    return NextResponse.json({ ok: true, data, total, offset, limit }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao carregar comissões";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/* ============== POST (upsert por compraId+cedenteId) ============== */
/**
Body:
{
  "compraId": string,
  "cedenteId": string,
  "cedenteNome"?: string,
  "valor": number | string,
  "status"?: "pago" | "aguardando"
}
*/
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
    const body: Partial<PostBody> = typeof raw === "object" && raw !== null ? (raw as Partial<PostBody>) : {};

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
      update: { cedenteNome, valor, status, atualizadoEm: new Date() },
      create: { compraId, cedenteId, cedenteNome, valor, status },
    });

    return NextResponse.json({ ok: true, data }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao salvar comissão";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/* ============== PATCH (atualizar valor/status/nome) ============== */
/**
Query:
- compraId, cedenteId (ambos obrigatórios)

Body (qualquer campo abaixo é opcional):
{
  "valor"?: number | string,
  "status"?: "pago" | "aguardando",
  "cedenteNome"?: string
}
*/
type PatchBody = {
  valor?: number | string;
  status?: Status | "";
  cedenteNome?: string;
};

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const compraId = (searchParams.get("compraId") || "").trim();
    const cedenteId = (searchParams.get("cedenteId") || "").trim();
    if (!compraId || !cedenteId) {
      return NextResponse.json(
        { ok: false, error: "compraId e cedenteId são obrigatórios" },
        { status: 400, headers: noCache() }
      );
    }

    const raw: unknown = await req.json().catch(() => ({}));
    const body: Partial<PatchBody> = typeof raw === "object" && raw !== null ? (raw as Partial<PatchBody>) : {};

    const data: UpdateArgs["data"] = { atualizadoEm: new Date() };
    if (typeof body.cedenteNome === "string") data.cedenteNome = body.cedenteNome;
    if (body.valor !== undefined) data.valor = toDecimal(body.valor);
    if (body.status === "pago" || body.status === "aguardando") data.status = body.status;

    const repo = getRepo();
    if (!repo?.update) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            compraId,
            cedenteId,
            ...(data.cedenteNome ? { cedenteNome: data.cedenteNome } : {}),
            ...(data.valor ? { valor: data.valor } : {}),
            ...(data.status ? { status: data.status } : {}),
            _db: "skipped (model not found)",
          },
        },
        { headers: noCache() }
      );
    }

    const updated = await repo.update({
      where: { compraId_cedenteId: { compraId, cedenteId } },
      data,
    });

    return NextResponse.json({ ok: true, data: updated }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao atualizar comissão";
    const code = /not found|não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code, headers: noCache() });
  }
}

/* ============== DELETE (remover por compraId+cedenteId) ============== */
export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const compraId = (searchParams.get("compraId") || "").trim();
    const cedenteId = (searchParams.get("cedenteId") || "").trim();
    if (!compraId || !cedenteId) {
      return NextResponse.json(
        { ok: false, error: "compraId e cedenteId são obrigatórios" },
        { status: 400, headers: noCache() }
      );
    }

    const repo = getRepo();
    if (!repo?.delete) {
      return NextResponse.json(
        { ok: true, deleted: { compraId, cedenteId }, _db: "skipped (model not found)" },
        { headers: noCache() }
      );
    }

    await repo.delete({ where: { compraId_cedenteId: { compraId, cedenteId } } });
    return NextResponse.json({ ok: true, deleted: { compraId, cedenteId } }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao excluir comissão";
    const code = /not found|não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code, headers: noCache() });
  }
}
