// src/app/api/vendas/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ================== Constantes de Blob ================== */
const VENDAS_KIND = "vendas_blob";
const CEDENTES_KIND = "cedentes_blob";

/* ================== Tipos ================== */
type PaymentStatus = "pago" | "pendente";
type CIA = "latam" | "smiles";

type CancelInfo = {
  at: string;
  taxaCia: number;
  taxaEmpresa: number;
  refund: number;
  recreditPoints?: boolean;
  note?: string | null;
};

type ContaEscolhida = {
  id: string;
  nome: string;
  usar: number;
  disponivel: number;
  leftover: number;
  compraId: string | null;
  regra?: string;
};

type SugestaoParte = { id: string; nome: string; usar: number; disp: number };

type VendaRecord = {
  id: string;
  createdAt: string;

  data: string;
  pontos: number;
  cia: CIA;
  qtdPassageiros: number;

  funcionarioId: string | null;
  funcionarioNome: string | null;
  userName: string | null;
  userEmail: string | null;

  clienteId: string | null;
  clienteNome: string | null;
  clienteOrigem: string | null;

  contaEscolhida?: ContaEscolhida | null;
  sugestaoCombinacao?: SugestaoParte[];

  milheiros: number;
  valorMilheiro: number;
  valorPontos: number;
  taxaEmbarque: number;
  totalCobrar: number;

  metaMilheiro: number | null;
  comissaoBase: number;
  comissaoBonusMeta: number;
  comissaoTotal: number;

  cartaoFuncionarioId: string | null;
  cartaoFuncionarioNome: string | null;

  pagamentoStatus: PaymentStatus;

  localizador: string | null;
  origemIATA: string | null;
  sobrenome: string | null;

  cancelInfo?: CancelInfo | null;
};

type CedenteRec = {
  identificador: string;
  nome: string | null;
  nome_completo: string | null;
  latam: number;
  smiles: number;
  livelo: number;
  esfera: number;
};

/* ================== Utils ================== */
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function up(s: unknown): string {
  return String(s ?? "").toUpperCase();
}
function norm(s?: string | null) {
  return (s ?? "").toString().trim().toLowerCase();
}
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as unknown as Prisma.InputJsonValue;
}
function getArrayField<T = unknown>(obj: unknown, field: string): T[] {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const rec = obj as Record<string, unknown>;
    const value = rec[field];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

/* ================== AppBlob helpers ================== */
async function loadArrayFromBlob<T = unknown>(kind: string, field: string): Promise<T[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind } });
  const data = (blob?.data as Record<string, unknown> | null) ?? null;
  return getArrayField<T>(data, field);
}
async function saveArrayToBlob(kind: string, field: string, items: unknown[]): Promise<void> {
  const data = toJsonValue({ [field]: items });
  await prisma.appBlob.upsert({
    where: { kind },
    create: { id: randomUUID(), kind, data },
    update: { data },
  });
}

/* Cedentes: sempre usamos o campo "listaCedentes" dentro do blob */
async function loadCedentes(): Promise<CedenteRec[]> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: CEDENTES_KIND } });
  const raw = (blob?.data as Record<string, unknown> | null) ?? null;
  const arr = getArrayField<unknown>(raw, "listaCedentes");
  return arr.map(pickCedenteFields);
}
async function saveCedentes(arr: CedenteRec[]): Promise<void> {
  const data = toJsonValue({ listaCedentes: arr });
  await prisma.appBlob.upsert({
    where: { kind: CEDENTES_KIND },
    create: { id: randomUUID(), kind: CEDENTES_KIND, data },
    update: { data },
  });
}

/* ================== Normalizadores ================== */
function pickCedenteFields(c: unknown): CedenteRec {
  const r = isRecord(c) ? c : {};
  return {
    identificador: String(r["identificador"] ?? ""),
    nome:
      (typeof r["nome"] === "string" ? r["nome"] : null) ??
      (typeof r["nome_completo"] === "string" ? r["nome_completo"] : null),
    nome_completo:
      (typeof r["nome_completo"] === "string" ? r["nome_completo"] : null) ??
      (typeof r["nome"] === "string" ? r["nome"] : null),
    latam: toNum(r["latam"]),
    smiles: toNum(r["smiles"]),
    livelo: toNum(r["livelo"]),
    esfera: toNum(r["esfera"]),
  };
}

/* ================== Funcionário a partir do "login" do front ================== */
/** Tabela simples (mesmo seed do front) */
const FUNC_MAP: Record<string, { id: string; nome: string }> = {
  jephesson: { id: "F001", nome: "Jephesson" },
  lucas: { id: "F002", nome: "Lucas" },
  paola: { id: "F003", nome: "Paola" },
  eduarda: { id: "F004", nome: "Eduarda" },
};

function resolveFuncionarioByNameOrEmailLocal(
  user: { name?: string | null; email?: string | null } | null
): { id: string; nome: string } | null {
  if (!user) return null;
  const byName = norm(user.name);
  const byLocal = norm((user.email || "").split("@")[0] || "");
  if (byName && FUNC_MAP[byName]) return FUNC_MAP[byName];
  for (const k of Object.keys(FUNC_MAP)) {
    if (byLocal.includes(k)) return FUNC_MAP[k];
  }
  return null;
}

/* ================== Handlers ================== */
export async function GET(): Promise<NextResponse> {
  const vendas = await loadArrayFromBlob<VendaRecord>(VENDAS_KIND, "lista");
  return NextResponse.json({ ok: true, lista: vendas }, { headers: noCache() });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body?.["cia"] || !body?.["pontos"]) {
      return NextResponse.json(
        { ok: false, error: "Campos obrigatórios ausentes (cia, pontos)." },
        { status: 400, headers: noCache() }
      );
    }

    // Sem next-auth no server: usa userName/userEmail enviados pelo front
    const frontUser = {
      name: (body["userName"] as string | null | undefined) ?? null,
      email: (body["userEmail"] as string | null | undefined) ?? null,
    };
    const funcionarioSessao = resolveFuncionarioByNameOrEmailLocal(frontUser);

    // Cedentes: usa blob existente; se não houver, aceita seed do body.
    const cedentesFromDb = await loadCedentes();
    const seedArr: unknown[] = Array.isArray(body["cedentes"])
      ? (body["cedentes"] as unknown[])
      : Array.isArray(body["cedentesSnapshot"])
      ? (body["cedentesSnapshot"] as unknown[])
      : [];

    const cedentes: CedenteRec[] =
      cedentesFromDb.length > 0
        ? [...cedentesFromDb]
        : seedArr.length
        ? seedArr.map(pickCedenteFields)
        : [];

    if (cedentesFromDb.length === 0 && seedArr.length) {
      await saveCedentes(cedentes);
    }

    const id = "V" + Date.now();
    const record: VendaRecord = {
      id,
      createdAt: new Date().toISOString(),

      data: String(body["data"] ?? ""),
      pontos: toNum(body["pontos"]),
      cia: body["cia"] === "latam" ? "latam" : "smiles",
      qtdPassageiros: toNum(body["qtdPassageiros"]),

      // força pelo "login" inferido do front; se não achar, usa o que veio no body
      funcionarioId:
        funcionarioSessao?.id ??
        ((body["funcionarioId"] as string | null | undefined) ?? null),
      funcionarioNome:
        funcionarioSessao?.nome ??
        ((body["funcionarioNome"] as string | null | undefined) ?? null),

      userName: frontUser.name,
      userEmail: frontUser.email,

      clienteId: (body["clienteId"] as string | null | undefined) ?? null,
      clienteNome: (body["clienteNome"] as string | null | undefined) ?? null,
      clienteOrigem: (body["clienteOrigem"] as string | null | undefined) ?? null,

      contaEscolhida: (body["contaEscolhida"] as ContaEscolhida | null | undefined) ?? null,
      sugestaoCombinacao: Array.isArray(body["sugestaoCombinacao"])
        ? (body["sugestaoCombinacao"] as SugestaoParte[])
        : [],

      milheiros: toNum(body["milheiros"]),
      valorMilheiro: toNum(body["valorMilheiro"]),
      valorPontos: toNum(body["valorPontos"]),
      taxaEmbarque: toNum(body["taxaEmbarque"]),
      totalCobrar: toNum(body["totalCobrar"]),

      metaMilheiro:
        typeof body["metaMilheiro"] === "number" ? (body["metaMilheiro"] as number) : null,
      comissaoBase: toNum(body["comissaoBase"]),
      comissaoBonusMeta: toNum(body["comissaoBonusMeta"]),
      comissaoTotal: toNum(body["comissaoTotal"]),

      // Cartão: se não vier, usa o mesmo do funcionário “logado”
      cartaoFuncionarioId:
        (body["cartaoFuncionarioId"] as string | null | undefined) ??
        funcionarioSessao?.id ??
        null,
      cartaoFuncionarioNome:
        (body["cartaoFuncionarioNome"] as string | null | undefined) ??
        funcionarioSessao?.nome ??
        null,

      pagamentoStatus: (body["pagamentoStatus"] as PaymentStatus) || "pendente",

      localizador: (body["localizador"] as string | null | undefined) ?? null,
      origemIATA: (body["origemIATA"] as string | null | undefined) ?? null,
      sobrenome: (body["sobrenome"] as string | null | undefined) ?? null,

      cancelInfo: null,
    };

    const vendas = await loadArrayFromBlob<VendaRecord>(VENDAS_KIND, "lista");
    vendas.unshift(record);
    await saveArrayToBlob(VENDAS_KIND, "lista", vendas);

    // desconta pontos
    const saldoField: keyof CedenteRec = record.cia === "latam" ? "latam" : "smiles";
    const descontar = (cedenteId: string, qtd: number) => {
      const idx = cedentes.findIndex((c) => up(c.identificador) === up(cedenteId));
      if (idx < 0) return;
      const antes = cedentes[idx][saldoField];
      cedentes[idx][saldoField] = Math.max(0, antes - toNum(qtd));
    };

    if (record.contaEscolhida?.id) {
      descontar(record.contaEscolhida.id, record.pontos);
    } else if (Array.isArray(record.sugestaoCombinacao) && record.sugestaoCombinacao.length) {
      for (const parte of record.sugestaoCombinacao) {
        descontar(parte.id, toNum(parte.usar));
      }
    }

    await saveCedentes(cedentes);

    return NextResponse.json({ ok: true, id, nextCedentes: cedentes }, { headers: noCache() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const vendas = await loadArrayFromBlob<VendaRecord>(VENDAS_KIND, "lista");

    const id = String(body["id"] ?? "");
    const idx = vendas.findIndex((v) => v.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: "Venda não encontrada." },
        { status: 404, headers: noCache() }
      );
    }
    const cur = vendas[idx];

    // 1) Atualização simples do pagamentoStatus
    if (
      body["pagamentoStatus"] &&
      (body["pagamentoStatus"] === "pago" || body["pagamentoStatus"] === "pendente")
    ) {
      vendas[idx] = { ...cur, pagamentoStatus: body["pagamentoStatus"] as PaymentStatus };
      await saveArrayToBlob(VENDAS_KIND, "lista", vendas);
      return NextResponse.json({ ok: true, record: vendas[idx] }, { headers: noCache() });
    }

    // 2) Cancelamento (com taxas/estorno e possível devolução de pontos)
    if (isRecord(body["cancel"])) {
      const cancel = body["cancel"] as Record<string, unknown>;
      const taxaCia = toNum(cancel["taxaCia"]);
      const taxaEmpresa = toNum(cancel["taxaEmpresa"]);
      const recredit = Boolean(cancel["recreditPoints"]);
      const note = typeof cancel["note"] === "string" ? (cancel["note"] as string) : null;

      const refund = Math.max(0, toNum(cur.totalCobrar) - (taxaCia + taxaEmpresa));

      const updated: VendaRecord = {
        ...cur,
        cancelInfo: {
          at: new Date().toISOString(),
          taxaCia,
          taxaEmpresa,
          refund,
          recreditPoints: recredit,
          note,
        },
      };

      // devolve pontos (opcional)
      if (recredit) {
        const cedentes = await loadCedentes();
        const saldoField: keyof CedenteRec = cur.cia === "latam" ? "latam" : "smiles";
        const creditar = (cedenteId: string, qtd: number) => {
          const i = cedentes.findIndex((c) => up(c.identificador) === up(cedenteId));
          if (i < 0) return;
          const antes = cedentes[i][saldoField];
          cedentes[i][saldoField] = Math.max(0, antes + toNum(qtd));
        };

        if (cur.contaEscolhida?.id) {
          creditar(cur.contaEscolhida.id, cur.pontos);
        } else if (Array.isArray(cur.sugestaoCombinacao) && cur.sugestaoCombinacao.length) {
          for (const parte of cur.sugestaoCombinacao) {
            creditar(parte.id, toNum(parte.usar));
          }
        }
        await saveCedentes(cedentes);
      }

      vendas[idx] = updated;
      await saveArrayToBlob(VENDAS_KIND, "lista", vendas);
      return NextResponse.json({ ok: true, record: updated }, { headers: noCache() });
    }

    return NextResponse.json(
      { ok: false, error: "Nada para atualizar (use pagamentoStatus ou cancel)." },
      { status: 400, headers: noCache() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");
    let restorePoints = true;

    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (body?.["id"]) id = String(body["id"]);
      if (typeof body?.["restorePoints"] === "boolean")
        restorePoints = Boolean(body["restorePoints"]);
    } catch {
      /* body vazio */
    }

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID é obrigatório." },
        { status: 400, headers: noCache() }
      );
    }

    const vendas = await loadArrayFromBlob<VendaRecord>(VENDAS_KIND, "lista");
    const idx = vendas.findIndex((v) => v.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: "Venda não encontrada." },
        { status: 404, headers: noCache() }
      );
    }

    const removed = vendas[idx];

    // devolve pontos ao apagar (por erro) — padrão: sim
    if (restorePoints) {
      const cedentes = await loadCedentes();
      const saldoField: keyof CedenteRec = removed.cia === "latam" ? "latam" : "smiles";

      const creditar = (cedenteId: string, qtd: number) => {
        const i = cedentes.findIndex((c) => up(c.identificador) === up(cedenteId));
        if (i < 0) return;
        const antes = cedentes[i][saldoField];
        cedentes[i][saldoField] = Math.max(0, antes + toNum(qtd));
      };

      if (removed.contaEscolhida?.id) {
        creditar(removed.contaEscolhida.id, removed.pontos);
      } else if (
        Array.isArray(removed.sugestaoCombinacao) &&
        removed.sugestaoCombinacao.length
      ) {
        for (const parte of removed.sugestaoCombinacao) {
          creditar(parte.id, toNum(parte.usar));
        }
      }
      await saveCedentes(cedentes);
    }

    vendas.splice(idx, 1);
    await saveArrayToBlob(VENDAS_KIND, "lista", vendas);
    return NextResponse.json({ ok: true, removedId: id }, { headers: noCache() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
