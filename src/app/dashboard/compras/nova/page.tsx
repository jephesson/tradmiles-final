// src/app/dashboard/compras/nova/page.tsx
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Script from "next/script";
import * as React from "react";

/** ====== ENGINE CENTRAL (server-only) ====== */
import {
  computeTotais,
  computeDeltaPorPrograma,
  type ProgramaCIA,
  type ProgramaOrigem,
  type ProgramaGeral,
  type StatusItem,
  type ItemLinha,
  type ClubeItem,
  type CompraItem,
  type TransfItem,
} from "@/lib/calculo/engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Para compat com o PageProps do Next 15 (searchParams é Promise) */
type SearchParams = Record<string, string | string[] | undefined>;

/** ================= Helpers (server) ================= */
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(v) ? v : 0);

const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? Math.round(n) : 0
  );

/**
 * Lê um valor de formulário em REAIS.
 *
 * - "3168"       => 3168
 * - "3.168,90"   => 3168.9
 * - "3168,90"    => 3168.9
 */
const parseMoneyLoose = (s: FormDataEntryValue | null) => {
  const raw = (s ?? "").toString().trim();
  if (!raw) return 0;

  // Se tiver vírgula ou ponto, trata como valor em reais com decimais.
  if (/[.,]/.test(raw)) {
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  // Se vier só dígitos: "3168" => 3168 (reais)
  const onlyDigits = raw.replace(/[^\d]/g, "");
  if (!onlyDigits) return 0;
  const n = Number(onlyDigits);
  return Number.isFinite(n) ? n : 0;
};

const parseIntLoose = (s: FormDataEntryValue | null) => {
  const raw = (s ?? "").toString();
  if (!raw) return 0;
  const only = raw.replace(/[^\d]/g, "");
  return only ? Number(only) : 0;
};

const parsePctLoose = (s: FormDataEntryValue | null) => {
  const raw = (s ?? "").toString().replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const d2 = new Date(d.getTime() - off * 60 * 1000);
  return d2.toISOString().slice(0, 10);
}

/** Helpers de leitura segura (sem any) */
function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function getKey(o: unknown, k: string): unknown {
  return isRecord(o) ? o[k] : undefined;
}
function getStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function getStrKey(o: unknown, k: string): string {
  return getStr(getKey(o, k));
}
function getNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** ===== Tipos auxiliares (server) ===== */
type StatusComissao = "pago" | "aguardando";
type Cedente = {
  id: string;
  nome: string;
  latam?: number;
  smiles?: number;
  livelo?: number;
  esfera?: number;
};
type CedenteRaw = {
  identificador: string;
  nome_completo?: string;
  nome?: string;
  latam?: number | string;
  smiles?: number | string;
  livelo?: number | string;
  esfera?: number | string;
};

type Draft = {
  compraId: string;
  dataCompra: string;
  cedenteId: string;
  linhas: ItemLinha[];
  comissaoCedente: number; // R$
  comissaoStatus: StatusComissao;
  metaMilheiro: number; // R$/milheiro
};

const DRAFT_COOKIE = "nova_compra_draft";

/** ===== Encaminhar cookies/headers para rotas internas (sem usar any) ===== */
async function apiFetch(path: string, init: RequestInit = {}) {
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;

  const reqHeaders = new Headers(init.headers ?? {});
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (cookieHeader) reqHeaders.set("cookie", cookieHeader);

  const auth = hdrs.get("authorization");
  if (auth && !reqHeaders.has("authorization")) {
    reqHeaders.set("authorization", auth);
  }

  return fetch(`${base}${path}`, { ...init, headers: reqHeaders });
}

/** ===== Persistência de rascunho via cookie ===== */
async function readDraft(): Promise<Draft | null> {
  const jar = await cookies();
  const c = jar.get(DRAFT_COOKIE)?.value;
  if (!c) return null;
  try {
    const d = JSON.parse(c) as Draft;
    if (!d || typeof d !== "object") return null;
    return {
      compraId: String(d.compraId || "0001"),
      dataCompra: String(d.dataCompra || hojeISO()),
      cedenteId: String(d.cedenteId || ""),
      linhas: Array.isArray(d.linhas) ? (d.linhas as ItemLinha[]) : [],
      comissaoCedente: Number.isFinite(d.comissaoCedente)
        ? d.comissaoCedente
        : 0,
      comissaoStatus: (d.comissaoStatus as StatusComissao) || "aguardando",
      metaMilheiro: Number.isFinite(d.metaMilheiro) ? d.metaMilheiro : 0,
    };
  } catch {
    return null;
  }
}
async function writeDraft(d: Draft) {
  const jar = await cookies();
  jar.set(DRAFT_COOKIE, JSON.stringify(d), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}
async function clearDraft() {
  const jar = await cookies();
  jar.set(DRAFT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
async function safeWriteDraft(d: Draft) {
  try {
    await writeDraft(d);
  } catch {}
}

/** ===== Carregamentos ===== */
async function loadCedentes(): Promise<Cedente[]> {
  try {
    const res = await apiFetch("/api/cedentes", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { listaCedentes?: CedenteRaw[] };
    };
    const lista = (json?.data?.listaCedentes ?? []) as CedenteRaw[];
    return (Array.isArray(lista) ? lista : []).map((r) => ({
      id: String(r.identificador),
      nome: String(r.nome_completo ?? r.nome ?? ""),
      latam: Number(r.latam ?? 0),
      smiles: Number(r.smiles ?? 0),
      livelo: Number(r.livelo ?? 0),
      esfera: Number(r.esfera ?? 0),
    }));
  } catch {
    return [];
  }
}
async function loadNextCompraId(): Promise<string> {
  try {
    const res = await apiFetch("/api/compras/next-id", {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return "0001";
    const json = (await res.json()) as { nextId?: number | string };
    return String(json?.nextId ?? "0001").padStart(4, "0");
  } catch {
    return "0001";
  }
}

/** ======= Carregar compra por ID (para editar) ======= */
async function loadCompraById(
  id: string
): Promise<Record<string, unknown> | null> {
  try {
    let res = await apiFetch(`/api/compras/${encodeURIComponent(id)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok && (res.status === 404 || res.status === 405)) {
      res = await apiFetch(`/api/compras?id=${encodeURIComponent(id)}`, {
        method: "GET",
        cache: "no-store",
      });
    }
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** ====== Coerção dos itens da API -> ItemLinha (engine) ====== */
function coerceItemLinha(u: unknown): ItemLinha | null {
  if (!isRecord(u)) return null;

  const kindRaw = getStrKey(u, "kind") || getStrKey(u, "tipo");
  const maybeData = getKey(u, "data");
  const dataRaw: Record<string, unknown> = isRecord(maybeData) ? maybeData : u;

  let kind = (kindRaw as ItemLinha["kind"]) || "";
  if (!kind) {
    if (getStrKey(dataRaw, "origem") && getStrKey(dataRaw, "destino"))
      kind = "transferencia";
    else if (
      getStrKey(dataRaw, "programa") &&
      getKey(dataRaw, "bonusPct") !== undefined
    )
      kind = "compra";
    else if (getStrKey(dataRaw, "programa")) kind = "clube";
  }

  const idCandidate =
    getNum(getKey(dataRaw, "id")) ||
    getNum(getKey(u, "id")) ||
    Date.now();
  const status = (getStrKey(dataRaw, "status") || "aguardando") as StatusItem;

  if (kind === "clube") {
    const it: ClubeItem = {
      id: idCandidate,
      programa: getStrKey(dataRaw, "programa") as ProgramaGeral,
      pontos: getNum(getKey(dataRaw, "pontos")),
      valor: getNum(getKey(dataRaw, "valor")),
      status,
    };
    return { kind: "clube", data: it };
  }

  if (kind === "compra") {
    const it: CompraItem = {
      id: idCandidate,
      programa: getStrKey(dataRaw, "programa") as ProgramaGeral,
      pontos: getNum(getKey(dataRaw, "pontos")),
      valor: getNum(getKey(dataRaw, "valor")),
      bonusPct: getNum(getKey(dataRaw, "bonusPct")),
      status,
    };
    return { kind: "compra", data: it };
  }

  if (kind === "transferencia") {
    const modo = getStrKey(dataRaw, "modo") as "pontos" | "pontos+dinheiro";
    const pontosUsados = getNum(getKey(dataRaw, "pontosUsados"));
    const pontosTotais =
      getNum(getKey(dataRaw, "pontosTotais")) || pontosUsados;
    const it: TransfItem = {
      id: idCandidate,
      origem: getStrKey(dataRaw, "origem") as ProgramaOrigem,
      destino: getStrKey(dataRaw, "destino") as ProgramaCIA,
      modo,
      pontosUsados,
      pontosTotais,
      valorPago: getNum(getKey(dataRaw, "valorPago")),
      bonusPct: getNum(getKey(dataRaw, "bonusPct")),
      status,
    };
    return { kind: "transferencia", data: it };
  }

  return null;
}

/**
 * ===== Base do draft =====
 */
async function ensureDraftBase(persistOnInit = false) {
  let d = await readDraft();
  const cedentes = await loadCedentes();
  if (!d) {
    const nextId = await loadNextCompraId();
    const defaultCedenteId = cedentes[0]?.id ?? "";
    d = {
      compraId: nextId,
      dataCompra: hojeISO(),
      cedenteId: defaultCedenteId,
      linhas: [],
      comissaoCedente: 0,
      comissaoStatus: "aguardando",
      metaMilheiro: 0,
    };
    if (persistOnInit) await writeDraft(d);
  } else if (!d.cedenteId && cedentes.length) {
    d.cedenteId = cedentes[0].id;
    if (persistOnInit) await writeDraft(d);
  }
  return d;
}

/** ===== Quando vier da lista: carregar a compra (online) e seedar o draft ===== */
async function ensureDraftFromCompraId(
  idParam: string
): Promise<Draft | null> {
  const wantId = String(idParam || "").replace(/[^\d]/g, "");
  if (!wantId) return null;

  const current = await readDraft();
  if (current?.compraId === wantId && current?.linhas?.length) return current;

  const raw = await loadCompraById(wantId);
  const cedentes = await loadCedentes();

  let draft: Draft = {
    compraId: wantId,
    dataCompra: hojeISO(),
    cedenteId: cedentes[0]?.id ?? "",
    linhas: [],
    comissaoCedente: 0,
    comissaoStatus: "aguardando",
    metaMilheiro: 0,
  };

  if (raw) {
    const rawData = getKey(raw, "data");
    const itensTop = getKey(raw, "itens");
    const itensDeep = isRecord(rawData) ? getKey(rawData, "itens") : undefined;
    const itensRaw = Array.isArray(itensTop)
      ? (itensTop as unknown[])
      : Array.isArray(itensDeep)
      ? (itensDeep as unknown[])
      : [];

    const linhas: ItemLinha[] = itensRaw
      .map(coerceItemLinha)
      .filter((x): x is ItemLinha => !!x);

    draft = {
      compraId: wantId,
      dataCompra: getStrKey(raw, "dataCompra") || hojeISO(),
      cedenteId: getStrKey(raw, "cedenteId") || draft.cedenteId,
      linhas,
      comissaoCedente: getNum(getKey(raw, "comissaoCedente")),
      comissaoStatus:
        (getStrKey(raw, "comissaoStatus") as StatusComissao) ||
        "aguardando",
      metaMilheiro: getNum(getKey(raw, "metaMilheiro")) || 0,
    };
  }

  await safeWriteDraft(draft);
  return draft;
}

/** ===== Persistência do draft ===== */
async function persistDraft(d: Draft) {
  // Primeiro calcula sem forçar meta para descobrir o custo/milheiro total.
  const baseTotals = computeTotais(
    d.linhas,
    d.comissaoCedente,
    d.metaMilheiro,
    1
  );
  const metaSugerida =
    baseTotals.custoMilheiroTotal > 0
      ? baseTotals.custoMilheiroTotal + 1.5
      : 0;
  const metaEffective =
    d.metaMilheiro && d.metaMilheiro > 0 ? d.metaMilheiro : metaSugerida;

  const totals = computeTotais(d.linhas, d.comissaoCedente, metaEffective, 1);

  const deltaPrevisto = computeDeltaPorPrograma(d.linhas);

  const cedentes = await loadCedentes();
  const cedenteNome =
    cedentes.find((c) => c.id === d.cedenteId)?.nome ?? "";

  const payload = {
    id: d.compraId,
    dataCompra: d.dataCompra,
    cedenteId: d.cedenteId,
    cedenteNome,
    itens: d.linhas,
    totais: {
      pontosCIA: totals.totalCIA,
      pontosLiberados: totals.ptsLiberados,
      pontosAguardando: totals.ptsAguardando,
      custoBase: totals.custoBase,
      taxaVendedores: totals.taxaVendedores,
      comissao: totals.comissao,
      custoTotal: totals.custoTotal,
      custoTotalLiberado: totals.custoTotalLiberado,
      custoMilheiro: totals.custoMilheiro,
      custoMilheiroTotal: totals.custoMilheiroTotal,
      lucroTotal: totals.lucroTotal,
    },
    metaMilheiro: metaEffective,
    comissaoCedente: d.comissaoCedente,
    comissaoStatus: d.comissaoStatus,
    saldosDelta: deltaPrevisto,
  };

  // 1) PATCH /api/compras/:id
  let res = await apiFetch(`/api/compras/${encodeURIComponent(d.compraId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  // 2) fallback PATCH ?id=
  if (!res.ok && (res.status === 404 || res.status === 405)) {
    res = await apiFetch(`/api/compras?id=${encodeURIComponent(d.compraId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  }

  // 3) POST (upsert)
  if (!res.ok) {
    res = await apiFetch("/api/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  }

  if (!res.ok) throw new Error("Erro ao salvar a compra");

  if (d.comissaoCedente > 0 && d.cedenteId) {
    await apiFetch("/api/comissoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compraId: d.compraId,
        cedenteId: d.cedenteId,
        cedenteNome,
        valor: d.comissaoCedente,
        status: d.comissaoStatus,
      }),
      cache: "no-store",
    });
  }
}

/** ===== Server Actions ===== */

/** Cabeçalho */
async function actUpdateHeader(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  d.dataCompra = String(formData.get("dataCompra") || d.dataCompra);
  d.compraId = String(formData.get("compraId") || d.compraId)
    .replace(/[^\d]/g, "")
    .padStart(4, "0");
  d.cedenteId = String(formData.get("cedenteId") || d.cedenteId);
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Comissão + Meta */
async function actUpdateComissaoMeta(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  d.comissaoCedente = parseMoneyLoose(formData.get("comissaoCedente"));
  d.comissaoStatus =
    (String(formData.get("comissaoStatus")) as StatusComissao) ||
    "aguardando";
  d.metaMilheiro = parseMoneyLoose(formData.get("metaMilheiro"));
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Add Clube */
async function actAddClube(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const it: ClubeItem = {
    id: Date.now(),
    programa: String(formData.get("clubePrograma")) as ProgramaGeral,
    pontos: parseIntLoose(formData.get("clubePontos")),
    valor: parseMoneyLoose(formData.get("clubeValor")),
    status:
      (String(formData.get("clubeStatus")) as StatusItem) || "aguardando",
  };
  d.linhas.push({ kind: "clube", data: it });
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Add Compra */
async function actAddCompra(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const it: CompraItem = {
    id: Date.now(),
    programa: String(formData.get("compPrograma")) as ProgramaGeral,
    pontos: parseIntLoose(formData.get("compPontos")),
    valor: parseMoneyLoose(formData.get("compValor")),
    bonusPct: parsePctLoose(formData.get("compBonus")),
    status:
      (String(formData.get("compStatus")) as StatusItem) || "aguardando",
  };
  d.linhas.push({ kind: "compra", data: it });
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Add Transferência (entra como AGUARDANDO nesta tela) */
async function actAddTransf(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const modo = String(formData.get("trModo")) as
    | "pontos"
    | "pontos+dinheiro";

  const pontosUsados = parseIntLoose(formData.get("trPontosUsados"));
  const pontosTotais =
    modo === "pontos+dinheiro"
      ? parseIntLoose(formData.get("trPontosTotais"))
      : pontosUsados;

  // Pontos extras já existentes na CIA que serão usados na venda
  const pontosExtras = parseIntLoose(formData.get("trPontosExtras"));
  const custoMilheiroExtras = parseMoneyLoose(
    formData.get("trCustoMilheiroExtras")
  );
  const custoExtras =
    pontosExtras > 0 && custoMilheiroExtras > 0
      ? (pontosExtras / 1000) * custoMilheiroExtras
      : 0;

  const valorPagoBase = parseMoneyLoose(formData.get("trValorPago"));
  const valorPagoTotal = valorPagoBase + custoExtras;

  const it: TransfItem = {
    id: Date.now(),
    origem: String(formData.get("trOrigem")) as ProgramaOrigem,
    destino: String(formData.get("trDestino")) as ProgramaCIA,
    modo,
    pontosUsados,
    pontosTotais,
    valorPago: valorPagoTotal,
    bonusPct: parsePctLoose(formData.get("trBonus")),
    status: "aguardando",
  };
  d.linhas.push({ kind: "transferencia", data: it });
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Liberar item (status = liberado) */
async function actLiberarItem(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const id = Number(formData.get("itemId"));
  d.linhas = d.linhas.map((l) => {
    if (l.data.id !== id) return l;
    if (l.kind === "clube")
      return {
        kind: "clube",
        data: { ...(l.data as ClubeItem), status: "liberado" },
      };
    if (l.kind === "compra")
      return {
        kind: "compra",
        data: { ...(l.data as CompraItem), status: "liberado" },
      };
    return {
      kind: "transferencia",
      data: { ...(l.data as TransfItem), status: "liberado" },
    };
  });
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Remover item (extorna do saldo, pois some dos cálculos) */
async function actRemoveItem(formData: FormData) {
  "use server";
  const d = (await ensureDraftBase(true))!;
  const id = Number(formData.get("itemId"));
  d.linhas = d.linhas.filter((l) => l.data.id !== id);
  await writeDraft(d);
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Salvar (permanece na página nova) */
async function actSave() {
  "use server";
  const d = (await ensureDraftBase(true))!;
  await persistDraft(d);
  await clearDraft();
  redirect(
    "/dashboard/compras/nova?compraId=" +
      encodeURIComponent(d.compraId) +
      "&append=1"
  );
}

/** Salvar e voltar para a lista */
async function actSaveAndBack() {
  "use server";
  const d = (await ensureDraftBase(true))!;
  await persistDraft(d);
  await clearDraft();
  redirect("/dashboard/compras");
}

/** ======= Página (Server Component) ======= */
export default async function NovaCompraPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};

  // aceita "compraId" e também o antigo/typo "compralId"
  const compraIdRaw =
    (sp.compraId as string | string[] | undefined) ??
    ((sp as Record<string, string | string[] | undefined>)["compralId"]);

  const compraId = Array.isArray(compraIdRaw)
    ? compraIdRaw[0]
    : compraIdRaw;
  const appendFlag = (sp.append as string | undefined) ?? "1";

  const draftFromCompra = compraId
    ? await ensureDraftFromCompraId(String(compraId))
    : null;
  const d = draftFromCompra ?? (await ensureDraftBase(false))!;

  // --- CANONICALIZAÇÃO DA URL (sem Client Component) ---
  const urlHasRightCompraId = !!compraId && compraId === d.compraId;
  const urlHasAppend = appendFlag === "1";
  if (!urlHasRightCompraId || !urlHasAppend) {
    redirect(
      `/dashboard/compras/nova?compraId=${encodeURIComponent(
        d.compraId
      )}&append=1`
    );
  }

  const cedentes = await loadCedentes();
  const cedente = cedentes.find((c) => c.id === d.cedenteId);

  // ==== Painel de saldos ====
  const deltaLiberado = computeDeltaPorPrograma(d.linhas);

  const linhasComoLiberadas: ItemLinha[] = d.linhas.map((l) =>
    l.kind === "clube"
      ? {
          kind: "clube",
          data: { ...(l.data as ClubeItem), status: "liberado" },
        }
      : l.kind === "compra"
      ? {
          kind: "compra",
          data: { ...(l.data as CompraItem), status: "liberado" },
        }
      : {
          kind: "transferencia",
          data: { ...(l.data as TransfItem), status: "liberado" },
        }
  );
  const deltaPrevisto = computeDeltaPorPrograma(linhasComoLiberadas);

  // pendente = previsto - liberado
  const deltaPendente = {
    latam: (deltaPrevisto.latam ?? 0) - (deltaLiberado.latam ?? 0),
    smiles: (deltaPrevisto.smiles ?? 0) - (deltaLiberado.smiles ?? 0),
    livelo: (deltaPrevisto.livelo ?? 0) - (deltaLiberado.livelo ?? 0),
    esfera: (deltaPrevisto.esfera ?? 0) - (deltaLiberado.esfera ?? 0),
  };

  const saldoAtual = {
    latam: Number(cedente?.latam || 0),
    smiles: Number(cedente?.smiles || 0),
    livelo: Number(cedente?.livelo || 0),
    esfera: Number(cedente?.esfera || 0),
  };

  // “Saldo agora” = Atual + Liberado
  const saldoComLiberados = {
    latam: saldoAtual.latam + (deltaLiberado.latam || 0),
    smiles: saldoAtual.smiles + (deltaLiberado.smiles || 0),
    livelo: saldoAtual.livelo + (deltaLiberado.livelo || 0),
    esfera: saldoAtual.esfera + (deltaLiberado.esfera || 0),
  };

  // “Previsto (total)” = Atual + Previsto
  const saldoPrevisto = {
    latam: saldoAtual.latam + (deltaPrevisto.latam || 0),
    smiles: saldoAtual.smiles + (deltaPrevisto.smiles || 0),
    livelo: saldoAtual.livelo + (deltaPrevisto.livelo || 0),
    esfera: saldoAtual.esfera + (deltaPrevisto.esfera || 0),
  };

  // Totais + meta sugerida
  const baseTotals = computeTotais(
    d.linhas,
    d.comissaoCedente,
    d.metaMilheiro,
    1
  );
  const metaSugerida =
    baseTotals.custoMilheiroTotal > 0
      ? baseTotals.custoMilheiroTotal + 1.5
      : 0;
  const metaEffective =
    d.metaMilheiro && d.metaMilheiro > 0 ? d.metaMilheiro : metaSugerida;

  const totals = computeTotais(
    d.linhas,
    d.comissaoCedente,
    metaEffective,
    1
  );

  const comissaoInputDefault =
    d.comissaoCedente && d.comissaoCedente > 0
      ? d.comissaoCedente.toFixed(2).replace(".", ",")
      : "";

  // 🔽 aqui passa a usar SEMPRE a meta sugerida para preencher o input
  const metaInputDefault =
    metaSugerida && metaSugerida > 0
      ? metaSugerida.toFixed(2).replace(".", ",")
      : "";

  // flag para saber se já existe transferência nesse ID
  const hasTransf = d.linhas.some((l) => l.kind === "transferencia");

  // se ainda não houver transferência, sugere como "pontos extras"
  // o saldo atual (com liberados) da Latam — default do select de destino é Latam
  const defaultPontosExtrasPrimeiraTransf =
    !hasTransf && saldoComLiberados.latam > 0
      ? saldoComLiberados.latam
      : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-bold">
        Compra de pontos — ID {d.compraId}
      </h1>

      {/* Cabeçalho */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <form action={actUpdateHeader}>
          <label className="mb-1 block text-xs text-slate-600">Data</label>
          <input
            type="date"
            name="dataCompra"
            defaultValue={d.dataCompra}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <input type="hidden" name="compraId" value={d.compraId} />
          <input type="hidden" name="cedenteId" value={d.cedenteId} />
          <div className="mt-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100">
              Atualizar data
            </button>
          </div>
        </form>

        <form action={actUpdateHeader}>
          <label className="mb-1 block text-xs text-slate-600">ID</label>
          <input
            name="compraId"
            defaultValue={d.compraId}
            className="w-full rounded-xl border px-3 py-2 text-sm font-mono"
          />
          <input type="hidden" name="dataCompra" value={d.dataCompra} />
          <input type="hidden" name="cedenteId" value={d.cedenteId} />
          <div className="mt-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100">
              Atualizar ID
            </button>
          </div>
        </form>

        <form action={actUpdateHeader}>
          <label className="mb-1 block text-xs text-slate-600">Cedente</label>
          <select
            name="cedenteId"
            defaultValue={d.cedenteId}
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="">Selecione…</option>
            {cedentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <input type="hidden" name="dataCompra" value={d.dataCompra} />
          <input type="hidden" name="compraId" value={d.compraId} />
          <div className="mt-2">
            <button className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-100">
              Atualizar cedente
            </button>
          </div>
        </form>

        <div className="flex items-end gap-2">
          <form action={actSave}>
            <button
              type="submit"
              className="w-full rounded-lg border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Salvar
            </button>
          </form>
          <form action={actSaveAndBack}>
            <button
              type="submit"
              className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-slate-100"
              title="Salvar e voltar para a lista"
            >
              Salvar e voltar
            </button>
          </form>
        </div>
      </div>

      {/* Painel de Saldos do Cedente */}
      {d.cedenteId && (
        <div className="mb-6 rounded-xl border p-3">
          <div className="mb-2 text-sm font-semibold">Saldos do cedente</div>
          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
            {(["latam", "smiles", "livelo", "esfera"] as const).map((k) => (
              <div key={k} className="rounded-lg border px-3 py-2">
                <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
                  {k}
                </div>
                <div className="text-[13px] space-y-1">
                  <div>
                    Atual: <b>{fmtInt(saldoAtual[k])}</b>
                  </div>
                  <div>
                    Liberado (entra agora):{" "}
                    <b
                      className={
                        (deltaLiberado[k] ?? 0) >= 0
                          ? "text-green-700"
                          : "text-red-700"
                      }
                    >
                      {(deltaLiberado[k] ?? 0) >= 0 ? "+" : ""}
                      {fmtInt(deltaLiberado[k] ?? 0)}
                    </b>
                  </div>
                  <div>
                    Pendente:{" "}
                    <b
                      className={
                        (deltaPendente[k] ?? 0) >= 0
                          ? "text-amber-700"
                          : "text-red-700"
                      }
                    >
                      {(deltaPendente[k] ?? 0) >= 0 ? "+" : ""}
                      {fmtInt(deltaPendente[k] ?? 0)}
                    </b>
                  </div>
                  <div className="pt-1 border-t text-[12px] text-slate-600">
                    Saldo agora (Atual + Liberado):{" "}
                    <b>{fmtInt(saldoComLiberados[k])}</b>
                  </div>
                  <div>
                    Previsto (total): <b>{fmtInt(saldoPrevisto[k])}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === Clubes === */}
      <section className="mb-4 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Clubes</div>
        </div>
        <form
          action={actAddClube}
          className="grid grid-cols-1 gap-3 p-3 md:grid-cols-5"
        >
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Programa
            </label>
            <select
              name="clubePrograma"
              defaultValue="latam"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="livelo">Livelo</option>
              <option value="esfera">Esfera</option>
              <option value="latam">Latam Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Quantidade de pontos
            </label>
            <input
              name="clubePontos"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 3000"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Valor (R$)
            </label>
            <input
              name="clubeValor"
              inputMode="decimal"
              pattern="^(?:[0-9]+|[0-9]+[.,][0-9]{2})$"
              title="Digite o valor em reais. Aceita 356 ou 356,00"
              placeholder="ex.: 356 ou 356,00"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Status inicial
            </label>
            <select
              name="clubeStatus"
              defaultValue="aguardando"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="aguardando">Aguardando liberação</option>
              <option value="liberado">Liberado</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90">
              Adicionar
            </button>
          </div>
          <div className="md:col-span-5 text-[11px] text-slate-600">
            * Apenas <b>Latam/Smiles</b> contam para o total de pontos da CIA.
            Livelo/Esfera não somam.
          </div>
        </form>
      </section>

      {/* === Compra de pontos === */}
      <section className="mb-4 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Compra de pontos</div>
        </div>
        <form
          action={actAddCompra}
          className="grid grid-cols-1 gap-3 p-3 md:grid-cols-6"
        >
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Programa
            </label>
            <select
              name="compPrograma"
              defaultValue="latam"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="livelo">Livelo</option>
              <option value="esfera">Esfera</option>
              <option value="latam">Latam Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Quantidade
            </label>
            <input
              name="compPontos"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 90000"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              % bônus
            </label>
            <input
              name="compBonus"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 80"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Valor (R$)
            </label>
            <input
              name="compValor"
              inputMode="decimal"
              pattern="^(?:[0-9]+|[0-9]+[.,][0-9]{2})$"
              title="Digite o valor em reais. Aceita 356 ou 356,00"
              placeholder="ex.: 356 ou 356,00"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Status inicial
            </label>
            <select
              name="compStatus"
              defaultValue="aguardando"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="aguardando">Aguardando liberação</option>
              <option value="liberado">Liberado</option>
            </select>
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90">
              Adicionar
            </button>
          </div>
          <div className="md:col-span-6 text-[11px] text-slate-600">
            * Só contam para a CIA as <b>compras em Latam/Smiles</b> (aplicando
            o bônus).
          </div>
        </form>
      </section>

      {/* === Transferência === */}
      <section className="mb-6 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Transferência de pontos</div>
        </div>
        <form
          action={actAddTransf}
          className="grid grid-cols-1 gap-3 p-3 md:grid-cols-8"
        >
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Origem
            </label>
            <select
              name="trOrigem"
              defaultValue="livelo"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="livelo">Livelo</option>
              <option value="esfera">Esfera</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Destino
            </label>
            <select
              name="trDestino"
              defaultValue="latam"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="latam">Latam Pass</option>
              <option value="smiles">Smiles</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Modo</label>
            <select
              name="trModo"
              defaultValue="pontos"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            >
              <option value="pontos">Pontos</option>
              <option value="pontos+dinheiro">Pontos + dinheiro</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">
              Pontos usados (origem)
            </label>
            <input
              name="trPontosUsados"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 90000"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">
              Pts transferidos (se pontos+dinheiro)
            </label>
            <input
              name="trPontosTotais"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 130000"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              Valor pago (R$)
            </label>
            <input
              name="trValorPago"
              inputMode="decimal"
              pattern="^(?:[0-9]+|[0-9]+[.,][0-9]{2})$"
              title="Digite o valor em reais. Aceita 250 ou 250,00"
              placeholder="ex.: 250 ou 250,00"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">
              % bônus
            </label>
            <input
              name="trBonus"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 70"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">
              Pontos extras na CIA (já existentes, usados na venda)
            </label>
            <input
              name="trPontosExtras"
              inputMode="numeric"
              pattern="^[0-9]*$"
              placeholder="ex.: 5000"
              defaultValue={
                defaultPontosExtrasPrimeiraTransf
                  ? String(defaultPontosExtrasPrimeiraTransf)
                  : ""
              }
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-slate-600">
              Custo por milheiro desses extras (R$)
            </label>
            <input
              name="trCustoMilheiroExtras"
              inputMode="decimal"
              pattern="^(?:[0-9]+|[0-9]+[.,][0-9]{2})$"
              title="Quanto vai custar o milheiro só desses pontos anteriores. Ex.: 25 ou 25,50"
              placeholder="ex.: 25 ou 25,50"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
            <div className="mt-1 text-[11px] text-slate-500">
              * Ex.: se você usar 5.000 pts antigos a R$ 25/milheiro, serão
              adicionados R$ 125,00 ao custo desta transferência.
            </div>
          </div>

          <div className="md:col-span-8 text-[11px] text-slate-600">
            * Chegam na CIA:{" "}
            <b>pontos usados (ou pts transferidos) × (1 + bônus%)</b>. Nesta
            tela, transferências entram como <b>aguardando</b>. Pontos extras na
            CIA entram apenas no <b>custo</b>, não alteram o total de pontos
            previstos.
          </div>
          <div className="md:col-span-8 flex items-end">
            <button className="w-full rounded-lg bg-black px-3 py-2 text-sm text-white hover:opacity-90">
              Adicionar
            </button>
          </div>
        </form>
      </section>

      {/* ===== Carrinho (itens adicionados) ===== */}
      <section className="mb-6 rounded-xl border">
        <div className="border-b px-3 py-2 text-sm font-semibold">
          Itens adicionados
        </div>
        {d.linhas.length === 0 ? (
          <div className="p-3 text-sm text-slate-600">
            Nenhum item adicionado.
          </div>
        ) : (
          <ul className="divide-y">
            {d.linhas.map((l) => {
              const itemId = l.data.id;
              const itemStatus = l.data.status;
              const resumo = renderResumoUnico(l);
              return (
                <li
                  key={itemId}
                  className="flex flex-col gap-2 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "rounded-full px-2 py-[2px] text-[11px] " +
                        badgeColor(l.kind)
                      }
                    >
                      {labelKind(l.kind)}
                    </span>
                    <span className="text-slate-700">{resumo}</span>
                    {itemStatus === "liberado" ? (
                      <span className="ml-2 rounded-full bg-green-100 text-green-800 text-[11px] px-2 py-[2px] border border-green-200">
                        LIBERADO
                      </span>
                    ) : (
                      <span className="ml-2 rounded-full bg-yellow-100 text-yellow-800 text-[11px] px-2 py-[2px] border border-yellow-200">
                        AGUARDANDO
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {itemStatus !== "liberado" && (
                      <form action={actLiberarItem}>
                        <input
                          type="hidden"
                          name="itemId"
                          value={String(itemId)}
                        />
                        <button
                          type="submit"
                          className="rounded-lg px-3 py-1 text-xs font-medium bg-green-600 text-white hover:bg-green-700 active:scale-[.98]"
                          title="Marcar como liberado"
                        >
                          Liberar
                        </button>
                      </form>
                    )}

                    <form action={actRemoveItem}>
                      <input
                        type="hidden"
                        name="itemId"
                        value={String(itemId)}
                      />
                      <button
                        type="submit"
                        className={
                          "rounded-lg px-3 py-1 text-xs font-medium border active:scale-[.98] " +
                          (itemStatus === "liberado"
                            ? "border-red-500 text-red-600 hover:bg-red-50"
                            : "hover:bg-slate-100")
                        }
                        title={
                          itemStatus === "liberado"
                            ? "Extornar pontos e remover item"
                            : "Remover item"
                        }
                      >
                        {itemStatus === "liberado" ? "Extornar" : "Remover"}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== Comissão + Meta ===== */}
      <form
        action={actUpdateComissaoMeta}
        className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-xs text-slate-600">
            Comissão ao cedente (R$)
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="comissaoCedente"
              defaultValue={comissaoInputDefault}
              inputMode="decimal"
              pattern="^(?:[0-9]+|[0-9]+[.,][0-9]{2})$"
              title="Digite o valor em reais. Aceita 10 ou 10,50"
              placeholder="ex.: 10 ou 10,50"
              className="w-full rounded-xl border px-3 py-2 text-sm"
            />
            <select
              name="comissaoStatus"
              defaultValue={d.comissaoStatus}
              className="rounded-xl border px-3 py-2 text-sm"
              title="Status do pagamento da comissão"
            >
              <option value="aguardando">Aguardando pagamento</option>
              <option value="pago">Pago</option>
            </select>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            * Valor em reais. Entra no custo total (além da taxa de 1% dos
            vendedores).
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">
            Meta de venda (R$/milheiro)
          </label>
          <input
            name="metaMilheiro"
            defaultValue={metaInputDefault}
            inputMode="decimal"
            pattern="^(?:[0-9]+|[0-9]+[.,][0-9]{2})$"
            title="Digite o valor em reais por milheiro. Aceita 2,80 ou 3"
            placeholder="ex.: 2,80"
            className="w-full rounded-xl border px-3 py-2 text-sm"
          />
          <div className="mt-1 text-[11px] text-slate-500">
            * Sugestão automática:{" "}
            <b>custo/milheiro total + R$ 1,50</b>. Ajuste se quiser subir ou
            baixar a margem.
          </div>
        </div>
        <div className="md:col-span-2">
          <button className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-100">
            Atualizar comissão/meta
          </button>
        </div>
      </form>

      {/* ===== Resumo ===== */}
      <div className="rounded-xl border p-4">
        <div className="mb-2 text-lg font-semibold">Resumo</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm">
          <div>
            {cedente?.nome && (
              <div>
                Cedente: <b>{cedente.nome}</b>
              </div>
            )}
            <div>
              Total de pontos (CIA): <b>{fmtInt(totals.totalCIA)}</b>
            </div>
            <div>
              Pontos liberados: <b>{fmtInt(totals.ptsLiberados)}</b>
            </div>
            <div>
              Pontos aguardando: <b>{fmtInt(totals.ptsAguardando)}</b>
            </div>
          </div>
          <div>
            <div>
              Custo base dos itens: <b>{fmtMoney(totals.custoBase)}</b>
            </div>
            <div>
              Taxa vendedores (1%):{" "}
              <b>{fmtMoney(totals.taxaVendedores)}</b>
            </div>
            <div>
              Comissão ao cedente: <b>{fmtMoney(totals.comissao)}</b>
            </div>
          </div>
        </div>
        <div
          className="mt-2 text-sm"
          id="resumo-custo-milheiro"
          data-base-custo-total={String(totals.custoTotal || 0)}
          data-base-total-cia={String(totals.totalCIA || 0)}
        >
          <div>
            <b>Custo total</b>: {fmtMoney(totals.custoTotal)}
          </div>
          <div>
            <b>Custo por milheiro (total)</b>:{" "}
            <span id="custo-milheiro-text">
              {fmtMoney(totals.custoMilheiroTotal || 0)}
            </span>
          </div>
          <div>
            <b>Lucro estimado (sobre liberado)</b>:{" "}
            {fmtMoney(totals.lucroTotal)}
          </div>
        </div>
      </div>

      {/* Script para pré-visualizar o custo/milheiro ao digitar os pontos extras */}
      <Script id="preview-custo-milheiro" strategy="afterInteractive">
        {`
          (function () {
            function parseMoneyLooseClient(value) {
              if (!value) return 0;
              const raw = String(value).trim();
              if (!raw) return 0;
              if (/[.,]/.test(raw)) {
                const normalized = raw.replace(/\\./g, "").replace(",", ".");
                const n = Number(normalized);
                return Number.isFinite(n) ? n : 0;
              }
              const onlyDigits = raw.replace(/[^\\d]/g, "");
              if (!onlyDigits) return 0;
              const n = Number(onlyDigits);
              return Number.isFinite(n) ? n : 0;
            }

            function parseIntLooseClient(value) {
              if (!value) return 0;
              const only = String(value).replace(/[^\\d]/g, "");
              return only ? Number(only) : 0;
            }

            function recalc() {
              const resumoEl = document.getElementById("resumo-custo-milheiro");
              const spanEl = document.getElementById("custo-milheiro-text");
              if (!resumoEl || !spanEl) return;

              const baseCustoTotal = parseFloat(
                resumoEl.dataset.baseCustoTotal || "0"
              );
              const baseTotalCIA = parseFloat(
                resumoEl.dataset.baseTotalCia || "0"
              );

              let custoTotal = baseCustoTotal;
              const totalCIA = baseTotalCIA; // extras não somam pontos, só custo

              const inputPtsExtras = document.querySelector(
                'input[name="trPontosExtras"]'
              ) as HTMLInputElement | null;
              const inputCustoExtras = document.querySelector(
                'input[name="trCustoMilheiroExtras"]'
              ) as HTMLInputElement | null;

              const ptsExtras = inputPtsExtras
                ? parseIntLooseClient(inputPtsExtras.value)
                : 0;
              const custoMilheiroExtras = inputCustoExtras
                ? parseMoneyLooseClient(inputCustoExtras.value)
                : 0;

              if (ptsExtras > 0 && custoMilheiroExtras > 0) {
                custoTotal += (ptsExtras / 1000) * custoMilheiroExtras;
              }

              const custoMilheiro =
                totalCIA > 0 ? custoTotal / (totalCIA / 1000) : 0;

              spanEl.textContent = custoMilheiro.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              });
            }

            window.addEventListener("load", function () {
              const inputPtsExtras = document.querySelector(
                'input[name="trPontosExtras"]'
              ) as HTMLInputElement | null;
              const inputCustoExtras = document.querySelector(
                'input[name="trCustoMilheiroExtras"]'
              ) as HTMLInputElement | null;

              if (inputPtsExtras) {
                inputPtsExtras.addEventListener("input", recalc);
              }
              if (inputCustoExtras) {
                inputCustoExtras.addEventListener("input", recalc);
              }

              recalc();
            });
          })();
        `}
      </Script>
    </main>
  );
}

/** ===== Render helpers (server) ===== */
function labelPrograma(p: ProgramaGeral): string {
  switch (p) {
    case "latam":
      return "Latam Pass";
    case "smiles":
      return "Smiles";
    case "livelo":
      return "Livelo";
    case "esfera":
      return "Esfera";
    default:
      return String(p);
  }
}
function labelKind(k: ItemLinha["kind"]): string {
  return k === "clube" ? "Clube" : k === "compra" ? "Compra" : "Transferência";
}
function badgeColor(k: ItemLinha["kind"]): string {
  if (k === "clube")
    return "bg-indigo-50 text-indigo-700 border border-indigo-200";
  if (k === "compra")
    return "bg-sky-50 text-sky-700 border border-sky-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}
function renderResumoUnico(l: ItemLinha): string {
  if (l.kind === "clube") {
    const it = l.data as ClubeItem;
    const conta = it.programa === "latam" || it.programa === "smiles";
    return `${labelPrograma(it.programa)} • ${fmtInt(
      it.pontos
    )} pts ${conta ? "(conta)" : "(não conta)"} • ${fmtMoney(it.valor)}`;
  }
  if (l.kind === "compra") {
    const it = l.data as CompraItem;
    const conta = it.programa === "latam" || it.programa === "smiles";
    const ptsFinais = conta
      ? Math.round(it.pontos * (1 + (it.bonusPct || 0) / 100))
      : it.pontos;
    return `${labelPrograma(it.programa)} • ${fmtInt(
      ptsFinais
    )} pts ${conta ? "(conta)" : "(não conta)"} • bônus ${
      it.bonusPct || 0
    }% • ${fmtMoney(it.valor)}`;
  }
  const it = l.data as TransfItem;
  const base = it.modo === "pontos+dinheiro" ? it.pontosTotais : it.pontosUsados;
  const chegam = Math.round(base * (1 + (it.bonusPct || 0) / 100));
  const detalhe =
    it.modo === "pontos+dinheiro"
      ? `usados ${fmtInt(it.pontosUsados)} • totais ${fmtInt(
          it.pontosTotais
        )}`
      : `usados ${fmtInt(it.pontosUsados)}`;
  const valor = fmtMoney(it.valorPago || 0);
  return `${labelPrograma(it.origem as ProgramaGeral)} → ${labelPrograma(
    it.destino as ProgramaGeral
  )} • ${it.modo} • ${detalhe} • chegam ${fmtInt(
    chegam
  )} pts • ${valor}`;
}
