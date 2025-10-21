// src/app/dashboard/compras/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, ReactNode, Fragment } from "react";
import { useRouter } from "next/navigation";

/** ===== Helpers gerais ===== */
const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0
  );

const fmtInt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? Math.round(n) : 0
  );

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function getNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function getKey(o: unknown, k: string): unknown {
  return isRecord(o) ? o[k] : undefined;
}
function getStrKey(o: unknown, k: string): string {
  return isRecord(o) && typeof o[k] === "string" ? (o[k] as string) : "";
}
function getNestedStr(o: unknown, k1: string, k2: string): string {
  const lvl1 = isRecord(o) ? o[k1] : undefined;
  return isRecord(lvl1) && typeof lvl1[k2] === "string" ? (lvl1[k2] as string) : "";
}

async function extractError(res: Response) {
  try {
    const data: unknown = await res.clone().json();
    if (isRecord(data)) {
      const err = (data as { error?: unknown }).error;
      const msg = (data as { message?: unknown }).message;
      if (typeof err === "string" && err.trim()) return err;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
    return res.statusText;
  } catch {
    const txt = await res.text();
    if (txt.startsWith("<!DOCTYPE") || txt.includes("<html")) return res.statusText;
    return txt || res.statusText;
  }
}

/** ===== Guards de itens ===== */
function isItemCompra(x: unknown): boolean {
  return isRecord(x) && x.kind === "compra" && isRecord(x.data) && typeof x.data.programa === "string";
}
function isItemTransf(x: unknown): boolean {
  return (
    isRecord(x) &&
    x.kind === "transferencia" &&
    isRecord(x.data) &&
    typeof x.data.destino === "string" &&
    typeof x.data.origem === "string"
  );
}
function isItemClube(x: unknown): boolean {
  return isRecord(x) && x.kind === "clube";
}

/** ===== Helpers tipados p/ itens (sem any) ===== */
type StatusItem = "liberado" | "aguardando" | string;

function itemKind(it: unknown): string {
  return isRecord(it) && typeof it.kind === "string" ? (it.kind as string) : "";
}
function itemData(it: unknown): Record<string, unknown> {
  if (!isRecord(it)) return {};
  const d = (it as { data?: unknown }).data;
  return isRecord(d) ? d : (it as Record<string, unknown>);
}
function toIdString(v: unknown): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}
function itemIdString(it: unknown): string {
  const d = itemData(it);
  const did = toIdString(d.id);
  if (did) return did;
  const tid = isRecord(it) ? toIdString((it as Record<string, unknown>)["id"]) : "";
  return tid;
}
function itemStatus(it: unknown): StatusItem {
  const d = itemData(it);
  const s = (d as { status?: unknown }).status;
  return typeof s === "string" ? (s as StatusItem) : "";
}
function itemValor(it: unknown): number {
  const k = itemKind(it);
  const d = itemData(it);
  if (k === "clube" || k === "compra") return getNum((d as { valor?: unknown }).valor);
  if (k === "transferencia") return getNum((d as { valorPago?: unknown }).valorPago);
  return 0;
}
function itemPontos(it: unknown): number {
  const k = itemKind(it);
  const d = itemData(it);
  if (k === "transferencia") {
    const modo = getStrKey(d, "modo");
    if (modo === "pontos+dinheiro") return getNum((d as { pontosTotais?: unknown }).pontosTotais);
    return getNum((d as { pontosUsados?: unknown }).pontosUsados);
  }
  return getNum((d as { pontos?: unknown }).pontos);
}
function markItemLiberado(it: unknown, idStr: string): unknown {
  if (!isRecord(it)) return it;
  const d = itemData(it);
  const topId = isRecord(it) ? (it as Record<string, unknown>)["id"] : undefined;
  const match = itemIdString(it) === idStr || toIdString(topId) === idStr;
  if (!match) return it;
  return {
    ...(it as Record<string, unknown>),
    data: { ...d, status: "liberado" as StatusItem },
  };
}

/* ===== Cálculos de exibição ===== */
function rowTotalPts(c: Record<string, unknown>) {
  const calc = isRecord(c.calculos) ? c.calculos : undefined;
  const totId = isRecord(c.totaisId) ? c.totaisId : undefined;
  const old = getNum(getKey(calc, "totalPts") ?? getKey(totId, "totalPts"));
  if (old > 0) return old;

  const tot = isRecord(c.totais) ? c.totais : undefined;
  const novo = getNum(getKey(tot, "totalCIA"));
  if (novo > 0) return novo;

  const itens = Array.isArray(c.itens) ? c.itens : [];
  const somaResumo = itens.reduce<number>((s, it) => {
    const r =
      isRecord(it) && isRecord((it as Record<string, unknown>).resumo)
        ? (it as Record<string, unknown>).resumo
        : undefined;
    return s + getNum(getKey(r, "totalPts"));
  }, 0);
  return somaResumo;
}

function rowCustoMilheiro(c: Record<string, unknown>) {
  const tot = isRecord(c.totais) ? c.totais : undefined;
  const direto = getNum(getKey(tot, "custoMilheiroTotal"));
  if (direto > 0) return direto;

  const totId = isRecord(c.totaisId) ? c.totaisId : undefined;
  const calc = isRecord(c.calculos) ? c.calculos : undefined;
  const stored = getNum(getKey(totId, "custoMilheiro") ?? getKey(calc, "custoMilheiro"));
  if (stored >= 1) return stored;

  const custoTotal = getNum(getKey(totId, "custoTotal") ?? getKey(calc, "custoTotal"));
  const pts = rowTotalPts(c);
  return pts > 0 ? custoTotal / (pts / 1000) : 0;
}

function rowMetaMilheiro(c: Record<string, unknown>) {
  const tot = isRecord(c.totais) ? c.totais : undefined;
  const metaTot = getNum(getKey(tot, "metaMilheiro"));
  const metaField = getNum((c as Record<string, unknown>)["metaMilheiro"]);
  const m = metaTot > 0 ? metaTot : metaField > 0 ? metaField : 0;
  if (m > 0) return m;

  const custo = rowCustoMilheiro(c);
  return Math.round((custo + 1.5) * 100) / 100;
}

function rowLucro(c: Record<string, unknown>) {
  const tot = isRecord(c.totais) ? c.totais : undefined;
  if (typeof getKey(tot, "lucroTotal") === "number") return getKey(tot, "lucroTotal") as number;

  const calc = isRecord(c.calculos) ? c.calculos : undefined;
  const totId = isRecord(c.totaisId) ? c.totaisId : undefined;
  const itens = Array.isArray(c.itens) ? c.itens : [];

  const ant =
    getNum(getKey(calc, "lucroTotal") ?? getKey(totId, "lucroTotal")) ||
    itens.reduce<number>((s, it) => {
      const r =
        isRecord(it) && isRecord((it as Record<string, unknown>).resumo)
          ? (it as Record<string, unknown>).resumo
          : undefined;
      return s + getNum(getKey(r, "lucroTotal"));
    }, 0);
  return ant;
}

function rowLucroProjetado(c: Record<string, unknown>) {
  const pts = rowTotalPts(c);
  const milheiros = pts / 1000;
  const meta = rowMetaMilheiro(c);
  const custo = rowCustoMilheiro(c);
  const receita = milheiros * meta;
  const custoTotal = milheiros * custo;
  return receita - custoTotal;
}

/** ===== Exibição (compat 2 modelos) ===== */
function rowModo(c: Record<string, unknown>): ReactNode {
  if (typeof c.modo === "string") return c.modo as string;

  const its = Array.isArray(c.itens) ? c.itens : [];
  const kinds = new Set(
    its.map((it) => (isRecord(it) ? (it as Record<string, unknown>).kind : undefined))
  );
  if (kinds.size === 0) return "—";
  if (kinds.size > 1) return "múltiplos";
  const k = [...kinds][0];
  if (k === "compra") return "compra";
  if (k === "transferencia") return "transferencia";
  return "—";
}

function rowCiaOrigem(c: Record<string, unknown>): string {
  if (typeof c.modo === "string" && c.modo === "compra") {
    const cia = (c as { ciaCompra?: unknown }).ciaCompra as string | undefined;
    return cia ? (cia === "latam" ? "Latam" : "Smiles") : "—";
  }
  if (typeof c.modo === "string" && c.modo === "transferencia") {
    const d = (c as { destCia?: unknown }).destCia as string | undefined;
    const o = (c as { origem?: unknown }).origem as string | undefined;
    const dTxt = d ? (d === "latam" ? "Latam" : "Smiles") : "?";
    const oTxt = o ? (o === "livelo" ? "Livelo" : "Esfera") : "?";
    return `${dTxt} ← ${oTxt}`;
  }

  const its = Array.isArray((c as { itens?: unknown[] }).itens) ? (c as { itens: unknown[] }).itens : [];
  if (its.length === 0) return "—";

  const compras = its.filter(isItemCompra);
  const transf = its.filter(isItemTransf);
  const clubes = its.filter(isItemClube);

  if (compras.length && !transf.length && !clubes.length) {
    const cias = new Set(
      compras
        .map((x) => getNestedStr(x, "data", "programa"))
        .filter((p) => p === "latam" || p === "smiles")
    );
    if (cias.size === 1) return [...cias][0] === "latam" ? "Latam" : "Smiles";
    return "múltiplas";
  }

  if (transf.length && !compras.length && !clubes.length) {
    const dests = new Set(transf.map((x) => getNestedStr(x, "data", "destino")));
    const orgs = new Set(transf.map((x) => getNestedStr(x, "data", "origem")));
    const d = dests.size === 1 ? ([...dests][0] === "latam" ? "Latam" : "Smiles") : "múltiplas";
    const o = orgs.size === 1 ? ([...orgs][0] === "livelo" ? "Livelo" : "Esfera") : "múltiplas";
    return `${d} ← ${o}`;
  }

  return "múltiplos";
}

/** ===== UI ===== */
function StatusChip(props: { s?: string; cancelada?: boolean }) {
  const { s, cancelada } = props;
  if (cancelada) {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700">
        Cancelada
      </span>
    );
  }
  if (s === "liberados")
    return (
      <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">
        Liberados
      </span>
    );
  return (
    <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
      Aguardando
    </span>
  );
}

/** ====== Resumo legível do item (fallback se não existir no banco) ====== */
function itemResumo(x: unknown): string {
  if (!isRecord(x)) return "";
  const kind = String((x as { kind?: unknown }).kind || "");
  const data = itemData(x);

  if (kind === "clube") {
    const prog = getStrKey(data, "programa");
    const pts = getNum(getKey(data, "pontos"));
    const val = getNum(getKey(data, "valor"));
    return `Clube • ${prog || "?"} • ${fmtInt(pts)} pts • ${fmtMoney(val)}`;
  }
  if (kind === "compra") {
    const prog = getStrKey(data, "programa");
    const pts = getNum(getKey(data, "pontos"));
    const bonus = getNum(getKey(data, "bonusPct"));
    const val = getNum(getKey(data, "valor"));
    const contaCIA = prog === "latam" || prog === "smiles";
    const finais = contaCIA ? Math.round(pts * (1 + (bonus || 0) / 100)) : pts;
    return `Compra • ${prog || "?"} • ${fmtInt(finais)} pts • bônus ${bonus || 0}% • ${fmtMoney(val)}`;
  }
  if (kind === "transferencia") {
    const o = getStrKey(data, "origem");
    const d = getStrKey(data, "destino");
    const modo = getStrKey(data, "modo");
    const usados = getNum(getKey(data, "pontosUsados"));
    const totais = getNum(getKey(data, "pontosTotais"));
    const base = modo === "pontos+dinheiro" ? totais : usados;
    const bonus = getNum(getKey(data, "bonusPct"));
    const chegam = Math.round(base * (1 + (bonus || 0) / 100));
    const val = getNum(getKey(data, "valorPago"));
    const det =
      modo === "pontos+dinheiro"
        ? `usados ${fmtInt(usados)} • totais ${fmtInt(totais)}`
        : `usados ${fmtInt(usados)}`;
    return `Transf. • ${o || "?"} → ${d || "?"} • ${modo || "?"} • ${det} • chegam ${fmtInt(
      chegam
    )} • ${fmtMoney(val)}`;
  }
  return "";
}

/** ===== Page ===== */
export default function ComprasListaPage() {
  const router = useRouter();

  // filtros
  const [q, setQ] = useState("");
  const [modo, setModo] = useState("");
  const [cia, setCia] = useState("");
  const [origem, setOrigem] = useState("");
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");

  // dados
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // expansor
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, { itens: unknown[] }>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const expandedRef = useRef<HTMLTableRowElement | null>(null);

  // tick para reload quando outra aba sinalizar
  const [refreshTick, setRefreshTick] = useState(0);

  // === AUTO REFRESH entre dispositivos (polling leve) ===
  useEffect(() => {
    let timer: number | undefined;
    function start() {
      if (document.visibilityState === "visible") {
        timer = window.setInterval(() => setRefreshTick((t) => t + 1), 15000);
      }
    }
    function stop() {
      if (timer) window.clearInterval(timer);
    }
    start();
    document.addEventListener("visibilitychange", () => {
      stop();
      start();
    });
    return () => stop();
  }, []);

  // carregar lista
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          q, modo, cia, origem, start, end,
          offset: String(offset),
          limit: String(limit),
        });
        const res = await fetch(`/api/compras?${qs.toString()}`, { signal: ctrl.signal, cache: "no-store" });
        const json = await res.json();
        const arr = (json.items || json.data || []) as Record<string, unknown>[];
        setItems(arr);
        setTotal(json.total ?? (arr ? arr.length : 0));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [q, modo, cia, origem, start, end, offset, limit, refreshTick]);

  // ouvir mudanças de outras abas e foco
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "TM_COMPRAS_REFRESH") setRefreshTick((t) => t + 1);
    };
    const onFocus = () => setRefreshTick((t) => t + 1);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // buscar detalhes quando abrir
  useEffect(() => {
    (async () => {
      if (!expandedId) return;

      // se já veio na lista com itens, usa direto
      const row = items.find((r) => String((r as { id?: unknown }).id) === expandedId);
      const jaTem =
        isRecord(row) && Array.isArray((row as { itens?: unknown[] }).itens) && (row as { itens: unknown[] }).itens.length > 0;
      if (jaTem) {
        setDetailsById((prev) => ({ ...prev, [expandedId]: { itens: (row as { itens: unknown[] }).itens } }));
      } else if (!detailsById[expandedId]) {
        setLoadingDetails(true);
        try {
          // GET /api/compras/:id  (fallback para ?id=)
          let res = await fetch(`/api/compras/${encodeURIComponent(expandedId)}`, { cache: "no-store" });
          if (!res.ok && (res.status === 404 || res.status === 405)) {
            res = await fetch(`/api/compras?id=${encodeURIComponent(expandedId)}`, { cache: "no-store" });
          }
          const json = await res.json();
          const itens = (json.itens || json.data?.itens || []) as unknown[];
          setDetailsById((prev) => ({ ...prev, [expandedId]: { itens } }));
        } catch {
          /* ignore */
        } finally {
          setLoadingDetails(false);
          requestAnimationFrame(() => {
            expandedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      } else {
        requestAnimationFrame(() => {
          expandedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    })();
  }, [expandedId, items, detailsById, refreshTick]);

  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);

  // === Ações ===
  async function handleCancelar(id: string) {
    if (!id) return;
    const ok = confirm(
      `Cancelar a compra ${id}? Os pontos serão estornados e o registro permanecerá como "Cancelada".`
    );
    if (!ok) return;

    setMsg(null);
    try {
      const res = await fetch(`/api/compras/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelar: true }),
      });
      if (!res.ok) {
        setMsg(`Erro ao cancelar: ${await extractError(res)}`);
        return;
      }
      setItems((prev) =>
        prev.map((x) => (String((x as { id?: unknown }).id) === id ? { ...x, cancelada: true } : x))
      );
      setMsg(`Compra ${id} cancelada e estornada.`);
      try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMsg(`Erro ao cancelar: ${e?.message || "Falha na rede"}`);
    } finally {
      setTimeout(() => setMsg(null), 3500);
    }
  }

  async function handleExcluir(id: string) {
    if (!id) return;
    const ok = confirm(
      `Excluir a compra ${id}? O registro e o ID serão removidos. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;

    setMsg(null);
    try {
      let res = await fetch(`/api/compras/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(`/api/compras?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      if (!res.ok) {
        setMsg(`Erro ao excluir: ${await extractError(res)}`);
        return;
      }
      setItems((prev) => prev.filter((x) => String((x as { id?: unknown }).id) !== id));
      setTotal((t) => Math.max(0, t - 1));
      setMsg(`Compra ${id} excluída com sucesso.`);
      try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMsg(`Erro ao excluir: ${e?.message || "Falha na rede"}`);
    } finally {
      setTimeout(() => setMsg(null), 3500);
    }
  }

  async function handleLiberarCompra(id: string) {
    try {
      const res = await fetch(`/api/compras/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusPontos: "liberados" }),
      });
      if (!res.ok) throw new Error(await extractError(res));
      setItems((prev) =>
        prev.map((r) => (String((r as { id?: unknown }).id) === id ? { ...r, statusPontos: "liberados" } : r))
      );
      try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMsg(e?.message || "Erro ao liberar");
      setTimeout(() => setMsg(null), 3000);
    }
  }

  // ✅ NOVO: liberar um item específico (corrige "Cannot find name 'handleLiberarItem'")
  async function handleLiberarItem(compraId: string, itemIdStr: string) {
    if (!compraId || !itemIdStr) return;
    setMsg(null);
    try {
      // 1) Tenta PATCH minimalista (algumas APIs aceitam esse formato)
      let res = await fetch(`/api/compras/${encodeURIComponent(compraId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: itemIdStr, status: "liberado" }),
      });

      // 2) Fallback: busca compra, altera itens localmente e faz PATCH completo
      if (!res.ok) {
        let getRes = await fetch(`/api/compras/${encodeURIComponent(compraId)}`, { cache: "no-store" });
        if (!getRes.ok && (getRes.status === 404 || getRes.status === 405)) {
          getRes = await fetch(`/api/compras?id=${encodeURIComponent(compraId)}`, { cache: "no-store" });
        }
        if (!getRes.ok) throw new Error(await extractError(getRes));

        const json = await getRes.json();
        const itensOrig = (json.itens || json.data?.itens || []) as unknown[];
        const itensAtualizados = itensOrig.map((it) => markItemLiberado(it, itemIdStr));

        res = await fetch(`/api/compras/${encodeURIComponent(compraId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: itensAtualizados }),
        });

        if (!res.ok && (res.status === 404 || res.status === 405)) {
          res = await fetch(`/api/compras?id=${encodeURIComponent(compraId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itens: itensAtualizados }),
          });
        }
      }

      if (!res.ok) throw new Error(await extractError(res));

      // Atualiza detalhes em memória
      setDetailsById((prev) => {
        const atual = prev[compraId]?.itens || [];
        const novos = atual.map((it) => markItemLiberado(it, itemIdStr));
        return { ...prev, [compraId]: { itens: novos as unknown[] } };
      });

      // Se todos os itens ficaram liberados, marca a compra como liberada na listagem
      const depois = detailsById[compraId]?.itens?.map((it) => markItemLiberado(it, itemIdStr)) || [];
      const allLib = depois.length > 0 && depois.every((it) => itemStatus(it) === "liberado");
      if (allLib) {
        setItems((prev) =>
          prev.map((r) =>
            String((r as { id?: unknown }).id) === compraId ? { ...r, statusPontos: "liberados" } : r
          )
        );
      }

      try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
      setMsg("Item liberado com sucesso.");
      setTimeout(() => setMsg(null), 2500);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setMsg(e?.message || "Erro ao liberar item");
      setTimeout(() => setMsg(null), 3500);
    }
  }

  // Redirecionar para tela "Nova compra" para adicionar item dentro do mesmo ID
  function goAdicionarItem(compraId: string) {
    try {
      // contexto leve para a tela "nova"
      const payload = { compraId, append: true, ts: Date.now() };
      localStorage.setItem("TM_COMPRAS_EDIT_CTX", JSON.stringify(payload));
    } catch { /* ignore */ }
    router.push(`/dashboard/compras/nova?compraId=${encodeURIComponent(compraId)}&append=1`);
  }

  /** ===== Linha expandida ===== */
  function ExpandedRow({ compra }: { compra: Record<string, unknown> }) {
    const id = String(compra.id || "");
    const cancelada = (compra as { cancelada?: unknown }).cancelada === true;
    const itens = detailsById[id]?.itens || [];

    return (
      <tr ref={expandedRef}>
        <td colSpan={10} className="bg-slate-50 px-3 py-3">
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Itens da compra {id}</div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-100"
                  onClick={() => setExpandedId(null)}
                >
                  Fechar
                </button>
                {!cancelada && getStrKey(compra, "statusPontos") !== "liberados" && (
                  <>
                    <button
                      className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-100"
                      onClick={() => goAdicionarItem(id)}
                    >
                      Adicionar item
                    </button>
                    <button
                      className="rounded-lg border bg-black px-3 py-1 text-sm text-white hover:opacity-90"
                      onClick={() => handleLiberarCompra(id)}
                    >
                      Liberar todos
                    </button>
                  </>
                )}
              </div>
            </div>

            {loadingDetails ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Carregando itens…
              </div>
            ) : itens.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Nenhum item encontrado para esta compra.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Detalhe</th>
                      <th className="px-3 py-2 text-right">Pontos</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it: unknown) => {
                      const kind = itemKind(it);
                      const itemIdStr = itemIdString(it) || "0";
                      const status = itemStatus(it);
                      const valor = itemValor(it);
                      const pontos = itemPontos(it);

                      return (
                        <tr key={itemIdStr} className="border-b last:border-0">
                          <td className="px-3 py-2 capitalize">{kind || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{itemResumo(it)}</td>
                          <td className="px-3 py-2 text-right">{fmtInt(pontos)}</td>
                          <td className="px-3 py-2 text-right">{fmtMoney(valor)}</td>
                          <td className="px-3 py-2">
                            {status === "liberado" ? (
                              <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">
                                Liberado
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                                Aguardando
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {!cancelada && status !== "liberado" && (
                              <button
                                className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-100"
                                onClick={() => handleLiberarItem(id, itemIdStr)}
                              >
                                Liberar item
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <main className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compras de pontos</h1>
        <Link
          href="/dashboard/compras/nova"
          className="rounded-lg border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Nova compra
        </Link>
      </div>

      {msg && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {msg}
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-7">
        <input
          value={q}
          onChange={(e) => {
            setOffset(0);
            setQ(e.target.value);
          }}
          placeholder="Buscar por ID/Cedente..."
          className="rounded-xl border px-3 py-2 text-sm md:col-span-2"
        />
        <select
          value={modo}
          onChange={(e) => {
            setOffset(0);
            setModo(e.target.value);
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">Modo: todos</option>
          <option value="compra">Compra</option>
          <option value="transferencia">Transferência</option>
        </select>
        <select
          value={cia}
          onChange={(e) => {
            setOffset(0);
            setCia(e.target.value);
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">CIA: todas</option>
          <option value="latam">Latam Pass</option>
          <option value="smiles">Smiles</option>
        </select>
        <select
          value={origem}
          onChange={(e) => {
            setOffset(0);
            setOrigem(e.target.value);
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          <option value="">Origem: todas</option>
          <option value="livelo">Livelo</option>
          <option value="esfera">Esfera</option>
        </select>
        <input
          type="date"
          value={start}
          onChange={(e) => {
            setOffset(0);
            setStart(e.target.value);
          }}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={end}
          onChange={(e) => {
            setOffset(0);
            setEnd(e.target.value);
          }}
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Modo</th>
              <th className="px-3 py-2 text-left">CIA/Origem</th>
              <th className="px-3 py-2 text-right">Pts</th>
              <th className="px-3 py-2 text-right">Custo/Milheiro</th>
              <th className="px-3 py-2 text-right">Lucro</th>
              <th className="px-3 py-2 text-right">Lucro projetado (meta)</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={10}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={10}>
                  Nenhuma compra encontrada.
                </td>
              </tr>
            )}
            {items.map((c) => {
              const cancelada = isRecord(c) && (c as { cancelada?: unknown }).cancelada === true;
              const id = String((c as { id?: unknown }).id || "");
              const isOpen = expandedId === id;
              return (
                <Fragment key={id}>
                  <tr className={`border-t ${cancelada ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2">{String((c as { dataCompra?: unknown }).dataCompra || "")}</td>
                    <td className="px-3 py-2 font-mono">{id}</td>
                    <td className="px-3 py-2 capitalize">{rowModo(c)}</td>
                    <td className="px-3 py-2">{rowCiaOrigem(c)}</td>
                    <td className="px-3 py-2 text-right">{fmtInt(rowTotalPts(c))}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(rowCustoMilheiro(c))}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(rowLucro(c))}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(rowLucroProjetado(c))}</td>
                    <td className="px-3 py-2">
                      <StatusChip s={getStrKey(c, "statusPontos")} cancelada={cancelada} />
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        className="rounded-lg border px-3 py-1 hover:bg-slate-100"
                        onClick={() => setExpandedId(isOpen ? null : id)}
                      >
                        {isOpen ? "Fechar" : "Abrir"}
                      </button>
                      {!cancelada && getStrKey(c, "statusPontos") !== "liberados" && (
                        <button
                          className="ml-2 rounded-lg border px-3 py-1 hover:bg-slate-100"
                          onClick={() => handleLiberarCompra(id)}
                        >
                          Liberar
                        </button>
                      )}
                      {!cancelada && (
                        <button
                          className="ml-2 rounded-lg border px-3 py-1 hover:bg-slate-100"
                          onClick={() => handleCancelar(id)}
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        className="ml-2 rounded-lg border px-3 py-1 hover:bg-rose-50"
                        onClick={() => handleExcluir(id)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>

                  {isOpen && <ExpandedRow compra={c as Record<string, unknown>} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <div>
          {total > 0 ? (
            <>Mostrando {pageFrom} – {pageTo} de {total}</>
          ) : (
            <>0 resultados</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Anterior
          </button>
          <button
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Próxima
          </button>
          <select
            value={limit}
            onChange={(e) => {
              setOffset(0);
              setLimit(parseInt(e.target.value, 10));
            }}
            className="rounded-lg border px-2 py-1"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}/página
              </option>
            ))}
          </select>
        </div>
      </div>
    </main>
  );
}
