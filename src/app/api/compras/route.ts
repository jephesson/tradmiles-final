import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

/**
 * >>> CENTRALIZAÇÃO <<<
 * Tudo que é cálculo/normalização de pontos/custos vem do engine.ts
 */
import {
  smartTotals,
  totalsCompatFromTotais,
  toDelta,
  type Delta,
  computeDeltaPorPrograma, // recalcula delta a partir dos itens quando não vier salvo
  type ItemLinha,
} from "@/lib/calculo/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- Persistência via AppBlob ---------------- */
const BLOB_KIND = "compras_blob";
const CEDENTES_BLOB = "cedentes_blob";

/** Estruturas utilitárias */
type AnyObj = Record<string, unknown>;

type BlobShape = { savedAt: string; items: AnyObj[] };

type CIA = "latam" | "smiles";
type Origem = "livelo" | "esfera";
type Status = "aguardando" | "liberados";

type CedenteRow = {
  identificador: string;
  nome_completo: string;
  latam?: number;
  smiles?: number;
  livelo?: number;
  esfera?: number;
  latam_pend?: number;
  smiles_pend?: number;
  livelo_pend?: number;
  esfera_pend?: number;
};

type CedentesBlob = { savedAt: string; listaCedentes: CedenteRow[] };

/** JSON puro p/ Prisma.InputJsonValue */
function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as unknown as Prisma.InputJsonValue;
}

/* ---------------- Utils ---------------- */
function isRecord(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
const add = (a = 0, b = 0) => Number(a || 0) + Number(b || 0);
const sub = (a = 0, b = 0) => Number(a || 0) - Number(b || 0);

/** Extrai id do query (?id=) OU do path (/api/compras/:id) */
function getIdFromReq(req: Request): string | null {
  try {
    const url = new URL(req.url);
    const qp = url.searchParams.get("id");
    if (qp) return qp;
    const segs = url.pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1];
    if (last && last !== "compras") return decodeURIComponent(last);
    return null;
  } catch {
    return null;
  }
}

/* ---------------- Compras: CRUD no AppBlob ---------------- */
async function loadAll(): Promise<BlobShape> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
  const data = (blob?.data as unknown as Partial<BlobShape>) || undefined;
  if (data && Array.isArray(data.items)) {
    return { savedAt: data.savedAt || new Date().toISOString(), items: data.items as AnyObj[] };
  }
  return { savedAt: new Date().toISOString(), items: [] };
}

async function saveAll(payload: BlobShape): Promise<void> {
  await prisma.appBlob.upsert({
    where: { kind: BLOB_KIND },
    create: { id: randomUUID(), kind: BLOB_KIND, data: toJsonValue(payload) },
    update: { data: toJsonValue(payload) },
  });
}

async function listComprasRaw(): Promise<AnyObj[]> {
  const all = await loadAll();
  return all.items;
}

async function findCompraById(id: string): Promise<AnyObj | null> {
  if (!id) return null;
  const all = await loadAll();
  return all.items.find((x) => String(x.id) === id) ?? null;
}

async function upsertCompra(doc: AnyObj): Promise<void> {
  const all = await loadAll();
  const idx = all.items.findIndex((x) => String(x.id) === String(doc.id));
  if (idx >= 0) all.items[idx] = doc;
  else all.items.unshift(doc);
  all.savedAt = new Date().toISOString();
  await saveAll(all);
}

async function updateCompraById(id: string, patch: Partial<AnyObj>): Promise<AnyObj> {
  const all = await loadAll();
  const idx = all.items.findIndex((x) => String(x.id) === id);
  if (idx < 0) throw new Error("Registro não encontrado");
  const next = { ...all.items[idx], ...patch };
  all.items[idx] = next;
  all.savedAt = new Date().toISOString();
  await saveAll(all);
  return next;
}

async function deleteCompraById(id: string): Promise<void> {
  const all = await loadAll();
  const prevLen = all.items.length;
  all.items = all.items.filter((x) => String(x.id) !== id);
  if (all.items.length === prevLen) throw new Error("Registro não encontrado");
  all.savedAt = new Date().toISOString();
  await saveAll(all);
}

/* ---------------- Cedentes helpers (blob online) ---------------- */
async function loadCedentes(): Promise<CedentesBlob> {
  const blob = await prisma.appBlob.findUnique({ where: { kind: CEDENTES_BLOB } });
  const data = (blob?.data as unknown as Partial<CedentesBlob>) || undefined;
  const z = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);
  if (data && Array.isArray(data.listaCedentes)) {
    return {
      savedAt: data.savedAt || new Date().toISOString(),
      listaCedentes: data.listaCedentes.map((c) => {
        const c0 = c as Partial<CedenteRow>;
        return {
          identificador: String(c0.identificador),
          nome_completo: String(c0.nome_completo),
          latam: z(c0.latam),
          smiles: z(c0.smiles),
          livelo: z(c0.livelo),
          esfera: z(c0.esfera),
          latam_pend: z(c0.latam_pend),
          smiles_pend: z(c0.smiles_pend),
          livelo_pend: z(c0.livelo_pend),
          esfera_pend: z(c0.esfera_pend),
        };
      }),
    };
  }
  return { savedAt: new Date().toISOString(), listaCedentes: [] };
}

async function saveCedentes(payload: CedentesBlob): Promise<void> {
  await prisma.appBlob.upsert({
    where: { kind: CEDENTES_BLOB },
    create: { id: randomUUID(), kind: CEDENTES_BLOB, data: toJsonValue(payload) },
    update: { data: toJsonValue(payload) },
  });
}

type ApplyOpts =
  | { mode: "main" }
  | { mode: "pending" }
  | { mode: "movePendingToMain" };

async function applyDeltaToCedenteWith(
  cedenteId: string,
  delta: Delta,
  opts: ApplyOpts
): Promise<CedentesBlob> {
  const all = await loadCedentes();
  const idx = all.listaCedentes.findIndex((c) => c.identificador === cedenteId);
  if (idx < 0) return all;

  const cur = all.listaCedentes[idx];
  const d = {
    latam: Number(delta.latam || 0),
    smiles: Number(delta.smiles || 0),
    livelo: Number(delta.livelo || 0),
    esfera: Number(delta.esfera || 0),
  };

  const next: CedenteRow = { ...cur };

  if (opts.mode === "main") {
    next.latam = add(cur.latam, d.latam);
    next.smiles = add(cur.smiles, d.smiles);
    next.livelo = add(cur.livelo, d.livelo);
    next.esfera = add(cur.esfera, d.esfera);
  } else if (opts.mode === "pending") {
    next.latam_pend = add(cur.latam_pend, d.latam);
    next.smiles_pend = add(cur.smiles_pend, d.smiles);
    next.livelo_pend = add(cur.livelo_pend, d.livelo);
    next.esfera_pend = add(cur.esfera_pend, d.esfera);
  } else if (opts.mode === "movePendingToMain") {
    next.latam_pend = sub(cur.latam_pend, d.latam);
    next.smiles_pend = sub(cur.smiles_pend, d.smiles);
    next.livelo_pend = sub(cur.livelo_pend, d.livelo);
    next.esfera_pend = sub(cur.esfera_pend, d.esfera);

    next.latam = add(cur.latam, d.latam);
    next.smiles = add(cur.smiles, d.smiles);
    next.livelo = add(cur.livelo, d.livelo);
    next.esfera = add(cur.esfera, d.esfera);
  }

  ([
    "latam", "smiles", "livelo", "esfera",
    "latam_pend", "smiles_pend", "livelo_pend", "esfera_pend",
  ] as (keyof CedenteRow)[]).forEach((k) => {
    const v = Number(next[k] ?? 0);
    // @ts-expect-error same-key assignment
    next[k] = Number.isFinite(v) ? Math.max(0, v) : 0;
  });

  all.listaCedentes[idx] = next;
  all.savedAt = new Date().toISOString();
  await saveCedentes(all);
  return all;
}

/* --------- Mini repo de comissão (dinâmico) --------- */
type RepoShape = {
  delete?: (args: {
    where: { compraId_cedenteId: { compraId: string; cedenteId: string } };
  }) => Promise<unknown>;
};
function isFn(x: unknown): x is (...args: unknown[]) => unknown {
  return typeof x === "function";
}
function isRepoShape(x: unknown): x is RepoShape {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return isFn(r.delete);
}
function getComissaoRepo(): RepoShape | null {
  const client = prisma as unknown as Record<string, unknown>;
  const candidates = ["comissao", "comissaoCedente", "commission"] as const;
  for (const k of candidates) {
    const repo = client[k];
    if (isRepoShape(repo)) return repo as RepoShape;
  }
  return null;
}

/* -------- Normalizações específicas da rota (seu formato antigo/novo) -------- */
function normalizeFromOldShape(body: AnyObj) {
  const modo: "compra" | "transferencia" =
    (str(body.modo) as "compra" | "transferencia") ||
    (body.origem ? "transferencia" : "compra");

  const resumo = {
    totalPts: num((body.calculos as AnyObj | undefined)?.totalPts),
    custoMilheiro: num((body.calculos as AnyObj | undefined)?.custoMilheiro),
    custoTotal: num((body.calculos as AnyObj | undefined)?.custoTotal),
    lucroTotal: num((body.calculos as AnyObj | undefined)?.lucroTotal),
  };

  const valores =
    (isRecord(body.valores) ? (body.valores as AnyObj) : undefined) ?? {
      ciaCompra: body.ciaCompra,
      destCia: body.destCia,
      origem: body.origem,
    };

  const itens = [{ idx: 1, modo, resumo, valores }];
  const totaisId = { ...resumo };

  const compat = {
    modo,
    ciaCompra: modo === "compra" ? (valores?.ciaCompra as CIA | null) ?? null : null,
    destCia: modo === "transferencia" ? (valores?.destCia as CIA | null) ?? null : null,
    origem: modo === "transferencia" ? (valores?.origem as Origem | null) ?? null : null,
  };

  const totais = {
    totalCIA: resumo.totalPts,
    custoTotal: resumo.custoTotal,
    custoMilheiroTotal: resumo.custoMilheiro,
    lucroTotal: resumo.lucroTotal,
  };

  return { itens, totaisId, totais, compat };
}

function normalizeFromNewShape(body: AnyObj) {
  const itens: unknown[] = Array.isArray(body.itens) ? (body.itens as unknown[]) : [];
  const totals = smartTotals(itens, body.totais);

  let modo: "compra" | "transferencia" | null = null;
  const kinds = new Set(
    (itens || []).map((it) => {
      const o = it as AnyObj;
      return (o.modo as string | undefined) ?? (o.kind as string | undefined);
    })
  );
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k === "compra" || k === "transferencia") modo = k;
  }

  let ciaCompra: CIA | null = null;
  let destCia: CIA | null = null;
  let origem: Origem | null = null;

  const firstCompra = (itens || []).find((x) => (x as AnyObj).kind === "compra" || (x as AnyObj).modo === "compra") as AnyObj | undefined;
  const firstTransf = (itens || []).find((x) => (x as AnyObj).kind === "transferencia" || (x as AnyObj).modo === "transferencia") as AnyObj | undefined;

  if (isRecord(firstCompra?.data)) {
    const p = str((firstCompra.data as AnyObj).programa);
    if (p === "latam" || p === "smiles") ciaCompra = p as CIA;
  }
  if (isRecord(firstTransf?.data)) {
    const d = str((firstTransf.data as AnyObj).destino);
    const o = str((firstTransf.data as AnyObj).origem);
    if (d === "latam" || d === "smiles") destCia = d as CIA;
    if (o === "livelo" || o === "esfera") origem = o as Origem;
  }

  const totaisId = {
    totalPts: totals.totalPts,
    custoTotal: totals.custoTotal,
    custoMilheiro: totals.custoMilheiro,
    lucroTotal: totals.lucroTotal,
  };

  const compat = { modo, ciaCompra, destCia, origem };

  const totais = {
    totalCIA: totals.totalPts,
    custoTotal: totals.custoTotal,
    custoMilheiroTotal: totals.custoMilheiro,
    lucroTotal: totals.lucroTotal,
  };

  return { itens, totaisId, totais, compat };
}

/** ===================== GET ===================== */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const id = getIdFromReq(req);

    if (id) {
      const item = (await findCompraById(id)) as AnyObj | null;
      if (!item) {
        return NextResponse.json({ error: "Não encontrado" }, { status: 404, headers: noCache() });
      }

      const totaisObj = isRecord(item.totais) ? (item.totais as AnyObj) : undefined;
      const hasPts = num(totaisObj?.totalCIA ?? totaisObj?.pontosCIA) > 0;

      if (!hasPts) {
        const totals = smartTotals((item.itens as unknown[]) || [], item.totais);
        const totalsIdObj = {
          totalPts: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiro: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        };
        item.totais = {
          totalCIA: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiroTotal: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        };
        item.totaisId = totalsIdObj;
        item.calculos = { ...totalsIdObj };
        await upsertCompra(item);
      }
      return NextResponse.json(item, { headers: noCache() });
    }

    const q = (url.searchParams.get("q") || "").toLowerCase();
    const modoFil = url.searchParams.get("modo") || "";
    const ciaFil = url.searchParams.get("cia") || "";
    const origemFil = url.searchParams.get("origem") || "";
    const start = url.searchParams.get("start") || "";
    const end = url.searchParams.get("end") || "";
    const offsetRaw = parseInt(url.searchParams.get("offset") || "0", 10);
    const limitRaw = parseInt(url.searchParams.get("limit") || "20", 10);

    const all = (await listComprasRaw()) as AnyObj[];

    const firstModo = (r: AnyObj) =>
      str(r.modo ?? (r.itens as AnyObj[] | undefined)?.[0]?.modo ?? (r.itens as AnyObj[] | undefined)?.[0]?.kind);

    const rowCIA = (r: AnyObj): string => {
      const m = firstModo(r);
      if (m === "compra") {
        const v1 = str(r.ciaCompra);
        if (v1) return v1;
        const v2 = (r.itens as AnyObj[] | undefined)?.[0]?.valores as AnyObj | undefined;
        if (isRecord(v2) && v2.ciaCompra) return str(v2.ciaCompra);
        const compra = (r.itens as AnyObj[] | undefined)?.find((x) => str((x as AnyObj).kind) === "compra") as AnyObj | undefined;
        const v3 = isRecord(compra?.data) ? str((compra.data as AnyObj).programa) : "";
        return v3 || "";
      }
      if (m === "transferencia") {
        const v1 = str(r.destCia);
        if (v1) return v1;
        const v2 = (r.itens as AnyObj[] | undefined)?.[0]?.valores as AnyObj | undefined;
        if (isRecord(v2) && v2.destCia) return str(v2.destCia);
        const transf = (r.itens as AnyObj[] | undefined)?.find((x) => str((x as AnyObj).kind) === "transferencia") as AnyObj | undefined;
        const v3 = isRecord(transf?.data) ? str((transf.data as AnyObj).destino) : "";
        return v3 || "";
      }
      return "";
    };

    const rowOrigem = (r: AnyObj): string => {
      const v1 = str(r.origem);
      if (v1) return v1;
      const v2 = (r.itens as AnyObj[] | undefined)?.[0]?.valores as AnyObj | undefined;
      if (isRecord(v2) && v2.origem) return str(v2.origem);
      const transf = (r.itens as AnyObj[] | undefined)?.find((x) => str((x as AnyObj).kind) === "transferencia") as AnyObj | undefined;
      const v3 = isRecord(transf?.data) ? str((transf.data as AnyObj).origem) : "";
      return v3 || "";
    };

    const normalized = (all || []).map((r) => {
      const totais = isRecord(r.totais) ? (r.totais as AnyObj) : undefined;
      const hasPts = num(totais?.totalCIA ?? totais?.pontosCIA) > 0;
      if (!hasPts) {
        const totals = smartTotals((r.itens as unknown[]) || [], r.totais);
        r = {
          ...r,
          totais: {
            totalCIA: totals.totalPts,
            custoTotal: totals.custoTotal,
            custoMilheiroTotal: totals.custoMilheiro,
            lucroTotal: totals.lucroTotal,
          },
          totaisId: {
            totalPts: totals.totalPts,
            custoTotal: totals.custoTotal,
            custoMilheiro: totals.custoMilheiro,
            lucroTotal: totals.lucroTotal,
          },
          calculos: {
            totalPts: totals.totalPts,
            custoTotal: totals.custoTotal,
            custoMilheiro: totals.custoMilheiro,
            lucroTotal: totals.lucroTotal,
          },
        } as AnyObj;
      } else if (totais?.pontosCIA && !totais?.totalCIA) {
        r = { ...r, totais: { ...totais, totalCIA: num(totais.pontosCIA) } } as AnyObj;
      }
      return r;
    });

    let rows = normalized.slice();

    if (q) {
      rows = rows.filter(
        (r) =>
          str(r.id).toLowerCase().includes(q) ||
          str(r.cedenteId).toLowerCase().includes(q) ||
          str((r as AnyObj).cedenteNome ?? "").toLowerCase().includes(q)
      );
    }
    if (modoFil) rows = rows.filter((r) => firstModo(r) === modoFil);
    if (ciaFil) rows = rows.filter((r) => rowCIA(r) === ciaFil);
    if (origemFil) rows = rows.filter((r) => rowOrigem(r) === origemFil);
    if (start) rows = rows.filter((r) => str(r.dataCompra) >= start);
    if (end) rows = rows.filter((r) => str(r.dataCompra) <= end);

    rows.sort((a, b) => {
      const da = str(a.dataCompra);
      const db = str(b.dataCompra);
      if (da < db) return 1;
      if (da > db) return -1;
      return str(a.id).localeCompare(str(b.id));
    });

    const total = rows.length;
    const offsetRawClamped = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
    const limitRawClamped = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 20, 500));
    const items = rows.slice(offsetRawClamped, offsetRawClamped + limitRawClamped);

    return NextResponse.json({ ok: true, total, items }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao carregar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** ===================== POST (upsert idempotente) ===================== */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await req.json();
    const body = isRecord(raw) ? (raw as AnyObj) : {};

    const id = str(body.id) || randomUUID();
    const dataCompra = str(body.dataCompra);
    const statusPontos = (str(body.statusPontos) as Status) || "aguardando";
    const cedenteIdNovo = str(body.cedenteId);
    const cedenteNome = str(body.cedenteNome);

    const usingNew = Array.isArray(body.itens);
    const { itens, totaisId, compat } = usingNew
      ? normalizeFromNewShape(body)
      : normalizeFromOldShape(body);

    const deltaNovoMaybe = isRecord(body.saldosDelta) ? (body.saldosDelta as AnyObj) : undefined;
    const deltaNovo: Delta =
      deltaNovoMaybe ? toDelta(deltaNovoMaybe) : computeDeltaPorPrograma((itens as unknown[]) as ItemLinha[]);

    const compraAntiga = id ? ((await findCompraById(id)) as AnyObj | null) : null;
    const cedenteIdAntigo = str(compraAntiga?.cedenteId);
    const deltaAntigo: Delta | undefined = isRecord(compraAntiga?.saldosDelta)
      ? toDelta(compraAntiga!.saldosDelta)
      : undefined;
    const statusAntigo = (str(compraAntiga?.statusPontos) as Status) || "aguardando";

    if (cedenteIdAntigo && deltaAntigo) {
      await applyDeltaToCedenteWith(
        cedenteIdAntigo,
        { latam: -num(deltaAntigo.latam), smiles: -num(deltaAntigo.smiles), livelo: -num(deltaAntigo.livelo), esfera: -num(deltaAntigo.esfera) },
        statusAntigo === "liberados" ? { mode: "main" } : { mode: "pending" }
      );
    }

    if (cedenteIdNovo && deltaNovo) {
      await applyDeltaToCedenteWith(
        cedenteIdNovo,
        { latam: num(deltaNovo.latam), smiles: num(deltaNovo.smiles), livelo: num(deltaNovo.livelo), esfera: num(deltaNovo.esfera) },
        statusPontos === "liberados" ? { mode: "main" } : { mode: "pending" }
      );
    }

    const doc: AnyObj = {
      id,
      dataCompra,
      statusPontos,
      cedenteId: cedenteIdNovo || undefined,
      cedenteNome: cedenteNome || undefined,
      itens: itens as unknown[],
      totaisId,
      modo: compat.modo ?? undefined,
      ciaCompra: (compat.ciaCompra as CIA | null) ?? undefined,
      destCia: (compat.destCia as CIA | null) ?? undefined,
      origem: (compat.origem as Origem | null) ?? undefined,
      calculos: { ...totaisId },
      savedAt: Date.now(),
      cancelada: false,
      saldosDelta: deltaNovo || { latam: 0, smiles: 0, livelo: 0, esfera: 0 },
    };

    await upsertCompra(doc);

    const nextCedentes = await loadCedentes();
    return NextResponse.json(
      { ok: true, id: String(doc.id), nextCedentes: nextCedentes.listaCedentes },
      { headers: noCache() }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao salvar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** ===================== PATCH (…/id OU ?id=) ===================== */
export async function PATCH(req: Request): Promise<NextResponse> {
  const id = getIdFromReq(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400, headers: noCache() });

  try {
    const patchRaw: unknown = await req.json().catch(() => ({}));
    const apply: AnyObj = isRecord(patchRaw) ? { ...patchRaw } : {};

    const atual = (await findCompraById(id)) as AnyObj | null;
    if (!atual) {
      return NextResponse.json({ error: "Registro não encontrado" }, { status: 404, headers: noCache() });
    }

    // ========= helpers de estorno inteligente =========
    function cap(cur: number, inv: number): number {
      // inv < 0 significa "reduzir" saldo → limita pelo saldo atual para não passar de 0
      if (inv < 0) return -Math.min(Math.abs(inv), Math.max(0, cur));
      // inv > 0 significa "aumentar" saldo → ok (clamp final já garante >= 0)
      return inv;
    }

    async function splitAndApplyRevert(
      cedenteId: string,
      inv: Delta,
      priority: "main" | "pending"
    ) {
      const all = await loadCedentes();
      const idx = all.listaCedentes.findIndex((c) => c.identificador === cedenteId);
      if (idx < 0) return;

      const cur = all.listaCedentes[idx];

      // lê saldos atuais de cada bucket
      const curMain = {
        latam: num(cur.latam),
        smiles: num(cur.smiles),
        livelo: num(cur.livelo),
        esfera: num(cur.esfera),
      };
      const curPend = {
        latam: num(cur.latam_pend),
        smiles: num(cur.smiles_pend),
        livelo: num(cur.livelo_pend),
        esfera: num(cur.esfera_pend),
      };

      // prioridade define em qual bucket tentar primeiro
      const first = priority === "main" ? "main" : "pending";
      const second = priority === "main" ? "pending" : "main";

      const outFirst: Delta = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
      const outSecond: Delta = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };

      (["latam", "smiles", "livelo", "esfera"] as const).forEach((k) => {
        const want = num(inv[k]); // quanto precisamos reverter ao todo (pode ser + ou -)
        if (!want) return;

        // tenta no bucket prioritário
        const curFirst = first === "main" ? curMain[k] : curPend[k];
        const applyFirst = cap(curFirst, want);
        outFirst[k] = applyFirst;

        // calcula resto (se capou)
        const rest = want - applyFirst;
        if (rest) {
          const curSecond = second === "main" ? curMain[k] : curPend[k];
          const applySecond = cap(curSecond, rest);
          outSecond[k] = applySecond;
        }
      });

      // aplica no bucket prioritário
      if (first === "main") {
        await applyDeltaToCedenteWith(cedenteId, outFirst, { mode: "main" });
      } else {
        await applyDeltaToCedenteWith(cedenteId, outFirst, { mode: "pending" });
      }
      // depois no outro bucket (se sobrou resto)
      if (second === "main") {
        await applyDeltaToCedenteWith(cedenteId, outSecond, { mode: "main" });
      } else {
        await applyDeltaToCedenteWith(cedenteId, outSecond, { mode: "pending" });
      }
    }
    // ========= fim helpers =========

    // ====== CANCELAR ======
    if (apply.cancelar === true || apply.cancelada === true) {
      if (atual.cancelada === true) {
        return NextResponse.json(atual, { headers: noCache() });
      }

      const cedenteId = str(atual.cedenteId);
      const statusDaCompra = (str(atual.statusPontos) as Status) || "aguardando";

      let delta = isRecord(atual.saldosDelta) ? toDelta(atual.saldosDelta as AnyObj) : undefined;
      if (!delta) {
        try { delta = computeDeltaPorPrograma((atual.itens as unknown[]) as ItemLinha[]); } catch { delta = undefined; }
      }

      if (cedenteId && delta) {
        // inverso do efeito
        const inv: Delta = {
          latam: -num(delta.latam),
          smiles: -num(delta.smiles),
          livelo: -num(delta.livelo),
          esfera: -num(delta.esfera),
        };

        // tenta primeiro no bucket onde (em teoria) estava aplicado; se não der, completa no outro
        const priority = statusDaCompra === "liberados" ? "main" : "pending";
        await splitAndApplyRevert(cedenteId, inv, priority);
      }

      const patched = await updateCompraById(id, {
        cancelada: true,
        cancelledAt: Date.now(),
        // zera o delta para evitar futuros movimentos (ex.: mudanças de status)
        saldosDelta: { latam: 0, smiles: 0, livelo: 0, esfera: 0 },
      });

      const nextCedentes = await loadCedentes();
      return NextResponse.json({ ok: true, ...patched, nextCedentes: nextCedentes.listaCedentes }, { headers: noCache() });
    }

    // ===== PATCH normal (status/itens etc.) =====
    const cedenteIdAnt = str(atual.cedenteId);
    const deltaAntRaw = isRecord(atual.saldosDelta) ? (atual.saldosDelta as AnyObj) : undefined;
    const deltaAnt: Required<Delta> = toDelta(deltaAntRaw);
    const statusAnt = (str(atual.statusPontos) as Status) || "aguardando";

    const cedenteIdNovo = typeof apply.cedenteId === "string" ? apply.cedenteId : cedenteIdAnt;
    const statusNovoRaw = typeof apply.statusPontos === "string" ? (apply.statusPontos as Status) : statusAnt;
    const statusNovo: Status = statusNovoRaw === "liberados" ? "liberados" : "aguardando";

    // Se já estiver cancelada, não mexe mais em saldos (apenas atualiza campos visuais)
    if (atual.cancelada === true) {
      const patchDoc: AnyObj = {};
      if (typeof apply.dataCompra === "string") patchDoc.dataCompra = apply.dataCompra;
      const updated = await updateCompraById(id, patchDoc);
      return NextResponse.json(updated, { headers: noCache() });
    }

    if (cedenteIdNovo && cedenteIdAnt && cedenteIdNovo !== cedenteIdAnt) {
      if (deltaAnt && (deltaAnt.latam || deltaAnt.smiles || deltaAnt.livelo || deltaAnt.esfera)) {
        await applyDeltaToCedenteWith(
          cedenteIdAnt,
          { latam: -deltaAnt.latam, smiles: -deltaAnt.smiles, livelo: -deltaAnt.livelo, esfera: -deltaAnt.esfera },
          statusAnt === "liberados" ? { mode: "main" } : { mode: "pending" }
        );
        await applyDeltaToCedenteWith(
          cedenteIdNovo,
          { latam:  deltaAnt.latam, smiles:  deltaAnt.smiles, livelo:  deltaAnt.livelo, esfera:  deltaAnt.esfera },
          statusNovo === "liberados" ? { mode: "main" } : { mode: "pending" }
        );
      }
    } else if (cedenteIdAnt && (statusAnt !== statusNovo)) {
      if (deltaAnt && (deltaAnt.latam || deltaAnt.smiles || deltaAnt.livelo || deltaAnt.esfera)) {
        if (statusAnt === "aguardando" && statusNovo === "liberados") {
          await applyDeltaToCedenteWith(cedenteIdAnt, deltaAnt, { mode: "movePendingToMain" });
        } else if (statusAnt === "liberados" && statusNovo === "aguardando") {
          await applyDeltaToCedenteWith(cedenteIdAnt, { latam: -deltaAnt.latam, smiles: -deltaAnt.smiles, livelo: -deltaAnt.livelo, esfera: -deltaAnt.esfera }, { mode: "main" });
          await applyDeltaToCedenteWith(cedenteIdAnt, { latam:  deltaAnt.latam, smiles:  deltaAnt.smiles, livelo:  deltaAnt.livelo, esfera:  deltaAnt.esfera }, { mode: "pending" });
        }
      }
    }

    if (Array.isArray(apply.itens) && !apply.totais && !apply.totaisId) {
      const smart = smartTotals(apply.itens as unknown[]);
      const totalsIdObj = {
        totalPts: smart.totalPts,
        custoTotal: smart.custoTotal,
        custoMilheiro: smart.custoMilheiro,
        lucroTotal: smart.lucroTotal,
      };
      apply.totaisId = totalsIdObj;
      apply.calculos = { ...totalsIdObj };
    }
    if (apply.totais && !apply.totaisId) {
      const compatTot = totalsCompatFromTotais(apply.totais);
      const totalsIdObj = {
        totalPts: compatTot.totalPts,
        custoTotal: compatTot.custoTotal,
        custoMilheiro: compatTot.custoMilheiro,
        lucroTotal: compatTot.lucroTotal,
      };
      apply.totaisId = totalsIdObj;
      apply.calculos = { ...totalsIdObj };
    }

    const patchDoc: AnyObj = {};
    if (statusNovo) patchDoc.statusPontos = statusNovo;
    if (typeof apply.dataCompra === "string") patchDoc.dataCompra = apply.dataCompra;
    if (typeof apply.cedenteId === "string") patchDoc.cedenteId = apply.cedenteId;
    if (apply.totaisId && isRecord(apply.totaisId)) {
      patchDoc.totaisId = {
        totalPts: num((apply.totaisId as AnyObj).totalPts),
        custoMilheiro: num((apply.totaisId as AnyObj).custoMilheiro),
        custoTotal: num((apply.totaisId as AnyObj).custoTotal),
        lucroTotal: num((apply.totaisId as AnyObj).lucroTotal),
      };
      patchDoc.calculos = patchDoc.totaisId as AnyObj;
    }

    if (Array.isArray(apply.itens)) {
      patchDoc.itens = apply.itens as unknown[];
      const first = (apply.itens as AnyObj[])[0];
      if (first) {
        const modo = str(first.modo ?? first.kind);
        patchDoc.modo = modo === "compra" || modo === "transferencia" ? modo : undefined;
        if (patchDoc.modo === "compra") {
          patchDoc.ciaCompra = str((first.valores as AnyObj | undefined)?.ciaCompra ?? (first.data as AnyObj | undefined)?.programa ?? "") as CIA;
          patchDoc.destCia = undefined;
          patchDoc.origem = undefined;
        } else if (patchDoc.modo === "transferencia") {
          patchDoc.ciaCompra = undefined;
          patchDoc.destCia = str((first.valores as AnyObj | undefined)?.destCia ?? (first.data as AnyObj | undefined)?.destino ?? "") as CIA;
          patchDoc.origem = str((first.valores as AnyObj | undefined)?.origem ?? (first.data as AnyObj | undefined)?.origem ?? "") as Origem;
        }
      }
    }

    if (typeof apply.savedAt === "number") patchDoc.savedAt = apply.savedAt;

    const updated = await updateCompraById(id, patchDoc);
    return NextResponse.json(updated, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar";
    const code = /não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code, headers: noCache() });
  }
}

/** ===================== DELETE (…/id OU ?id=) ===================== */
// Mantido por compatibilidade (o front usa PATCH cancelar)
export async function DELETE(req: Request): Promise<NextResponse> {
  const id = getIdFromReq(req);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400, headers: noCache() });

  try {
    const compra = (await findCompraById(id)) as AnyObj | null;
    if (!compra) {
      return NextResponse.json({ error: "Registro não encontrado" }, { status: 404, headers: noCache() });
    }

    const cedenteId = str(compra.cedenteId);

    let delta = isRecord(compra.saldosDelta) ? toDelta(compra.saldosDelta as AnyObj) : undefined;
    if (!delta) {
      try { delta = computeDeltaPorPrograma((compra.itens as unknown[]) as ItemLinha[]); } catch { delta = undefined; }
    }

    const statusDaCompra = (str(compra.statusPontos) as Status) || "aguardando";

    if (cedenteId && delta) {
      const inv: Delta = {
        latam: -num(delta.latam),
        smiles: -num(delta.smiles),
        livelo: -num(delta.livelo),
        esfera: -num(delta.esfera),
      };
      // usa mesma lógica "capada" do cancelamento
      const priority = statusDaCompra === "liberados" ? "main" : "pending";

      // helper inline (mesmo de cima, mas simples aqui)
      const all = await loadCedentes();
      const idx = all.listaCedentes.findIndex((c) => c.identificador === cedenteId);
      if (idx >= 0) {
        const cur = all.listaCedentes[idx];
        const get = (k: keyof CedenteRow) => num(cur[k]);

        function cap(curVal: number, invVal: number) {
          return invVal < 0 ? -Math.min(Math.abs(invVal), Math.max(curVal, 0)) : invVal;
        }

        const plan = (pri: "main" | "pending") => {
          const cm = { latam: get("latam"), smiles: get("smiles"), livelo: get("livelo"), esfera: get("esfera") };
          const cp = { latam: get("latam_pend"), smiles: get("smiles_pend"), livelo: get("livelo_pend"), esfera: get("esfera_pend") };
          const out1: Delta = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
          const out2: Delta = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
          (["latam","smiles","livelo","esfera"] as const).forEach((key) => {
            const want = num(inv[key]);
            if (!want) return;
            const curFirst = pri === "main" ? cm[key] : cp[key];
            const a1 = cap(curFirst, want);
            out1[key] = a1;
            const rest = want - a1;
            if (rest) {
              const curSecond = pri === "main" ? cp[key] : cm[key];
              out2[key] = cap(curSecond, rest);
            }
          });
          return { out1, out2 };
        };

        const { out1, out2 } = plan(priority);
        await applyDeltaToCedenteWith(cedenteId, out1, { mode: priority });
        await applyDeltaToCedenteWith(cedenteId, out2, { mode: priority === "main" ? "pending" : "main" });
      }
    }

    try {
      const repo = getComissaoRepo();
      if (repo?.delete && cedenteId) {
        await repo.delete({ where: { compraId_cedenteId: { compraId: id, cedenteId } } });
      }
    } catch {}

    await deleteCompraById(id);

    const nextCedentes = await loadCedentes();
    return NextResponse.json(
      { ok: true, deleted: id, nextCedentes: nextCedentes.listaCedentes },
      { headers: noCache() }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao excluir";
    const code = /não encontrado|not found/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code, headers: noCache() });
  }
}
