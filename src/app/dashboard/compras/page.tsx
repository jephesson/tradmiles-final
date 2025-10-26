"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
/** Lê kind de forma segura (evita any) */
function getKind(o: unknown): string {
  return isRecord(o) && typeof (o as { kind?: unknown }).kind === "string"
    ? String((o as { kind?: unknown }).kind)
    : "";
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
function rowModo(c: Record<string, unknown>): string {
  const modo = getStrKey(c, "modo");
  if (modo) return modo;

  const its = Array.isArray(c.itens) ? c.itens : [];
  const kinds = new Set(its.map((it) => getKind(it) || undefined));
  if (kinds.size === 0) return "—";
  if (kinds.size > 1) return "múltiplos";
  const k = [...kinds][0];
  if (k === "compra") return "compra";
  if (k === "transferencia") return "transferencia";
  return "—";
}

function rowCiaOrigem(c: Record<string, unknown>): string {
  const modo = getStrKey(c, "modo");
  if (modo === "compra") {
    const cia = getStrKey(c, "ciaCompra");
    return cia ? (cia === "latam" ? "Latam" : "Smiles") : "—";
  }
  if (modo === "transferencia") {
    const d = getStrKey(c, "destCia");
    const o = getStrKey(c, "origem");
    const dTxt = d ? (d === "latam" ? "Latam" : "Smiles") : "?";
    const oTxt = o ? (o === "livelo" ? "Livelo" : "Esfera") : "?";
    return `${dTxt} ← ${oTxt}`;
  }

  const its = Array.isArray((c as { itens?: unknown[] }).itens) ? (c as { itens: unknown[] }).itens : [];
  if (its.length === 0) return "—";

  const compras = its.filter((x) => getKind(x) === "compra");
  const transf = its.filter((x) => getKind(x) === "transferencia");
  const clubes = its.filter((x) => getKind(x) === "clube");

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

/** ==== API helpers (cancelar/excluir) ==== */
async function apiCancelCompra(id: string): Promise<boolean> {
  // 1) tenta PATCH /api/compras/:id
  try {
    const r = await fetch(`/api/compras/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelada: true }),
      cache: "no-store",
    });
    if (r.ok) return true;
  } catch { /* ignore */ }

  // 2) fallback: PATCH /api/pedidos/:id
  try {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelada: true }),
      cache: "no-store",
    });
    if (r.ok) return true;
  } catch { /* ignore */ }

  return false;
}

async function apiDeleteCompra(id: string): Promise<boolean> {
  // 1) tenta DELETE /api/compras/:id
  try {
    const r = await fetch(`/api/compras/${encodeURIComponent(id)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (r.ok) return true;
  } catch { /* ignore */ }

  // 2) fallback: DELETE /api/pedidos/:id
  try {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(id)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (r.ok) return true;
  } catch { /* ignore */ }

  return false;
}

/** ===== Page ===== */
export default function ComprasListaPage() {
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

  // tick p/ reload quando outra aba sinalizar
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
    const onVis = () => {
      stop();
      start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // carregar lista
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          q,
          modo,
          cia,
          origem,
          start,
          end,
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

  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);

  async function handleCancelar(id: string) {
    const ok = confirm("Confirmar cancelamento desta compra? Isso não remove o registro.");
    if (!ok) return;
    const done = await apiCancelCompra(id);
    if (!done) {
      alert("Não foi possível cancelar. Tente novamente.");
      return;
    }
    try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    setRefreshTick((t) => t + 1);
  }

  async function handleExcluir(id: string) {
    const ok = confirm("Excluir esta compra definitivamente?");
    if (!ok) return;
    const done = await apiDeleteCompra(id);
    if (!done) {
      alert("Não foi possível excluir. Tente novamente.");
      return;
    }
    try { localStorage.setItem("TM_COMPRAS_REFRESH", String(Date.now())); } catch {}
    setRefreshTick((t) => t + 1);
  }

  return (
    <main className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compras de pontos</h1>
        <Link
          href="/dashboard/compras/nova"
          prefetch={false}
          className="rounded-lg border bg-black px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Nova compra
        </Link>
      </div>

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
              return (
                <tr key={id} className={`border-t ${cancelada ? "opacity-60" : ""}`}>
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
                    <div className="flex items-center gap-2">
                      {/* Editar via GET para garantir querystring */}
                      <form action="/dashboard/compras/nova" method="GET">
                        <input type="hidden" name="compraId" value={id} />
                        <input type="hidden" name="append" value="1" />
                        <button
                          type="submit"
                          className="rounded-lg border px-3 py-1 hover:bg-slate-100"
                          title="Editar compra"
                        >
                          Editar
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => void handleCancelar(id)}
                        disabled={cancelada}
                        className="rounded-lg border px-3 py-1 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                        title={cancelada ? "Já cancelada" : "Cancelar compra (mantém registro)"}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExcluir(id)}
                        className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-red-700 hover:bg-red-100"
                        title="Excluir definitivamente"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
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
            type="button"
            className="rounded-lg border px-3 py-1 disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Anterior
          </button>
          <button
            type="button"
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
