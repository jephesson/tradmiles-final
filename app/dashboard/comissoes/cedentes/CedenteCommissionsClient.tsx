"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, RefreshCw, Search, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/cn";

type Status = "PENDING" | "PAID" | "CANCELED" | "";

type CommissionItem = {
  id: string;
  cedenteId: string;
  purchaseId: string | null;
  amountCents: number;
  status: "PENDING" | "PAID" | "CANCELED";
  generatedAt: string;
  paidAt: string | null;
  note: string | null;

  cedente?: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;

  purchase?: {
    id: string;
    numero: string;
    status: string;
    totalCents?: number | null;
  } | null;

  generatedBy?: { id: string; name: string; login: string } | null;
  paidBy?: { id: string; name: string; login: string } | null;
};

type TopRecebedor = {
  cedenteId: string | null;
  totalCents: number;
  count: number;
  cedente?: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;
};

type ListResp = {
  total: number;
  take: number;
  skip: number;
  items: CommissionItem[];
  topWindowDays?: number;
  topRecebedores?: TopRecebedor[];
};

const INPUT =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-slate-900/10";
const TH =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDateTimeBR(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

function statusBadge(status: CommissionItem["status"]) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
        Pendente
      </span>
    );
  }
  if (status === "PAID") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
        Paga
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
      Cancelada
    </span>
  );
}

function clampInt(v: unknown, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function CedenteCommissionsClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [status, setStatus] = useState<Status>("PENDING");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [take, setTake] = useState(50);
  const [skip, setSkip] = useState(0);
  const [topWindowDays, setTopWindowDays] = useState(30);

  const [data, setData] = useState<ListResp>({
    total: 0,
    take: 50,
    skip: 0,
    items: [],
  });

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("topWindowDays", String(topWindowDays));
      params.set("take", String(clampInt(take, 1, 200)));
      params.set("skip", String(clampInt(skip, 0, 1_000_000)));

      const res = await fetch(`/api/cedente-commissions?${params.toString()}`, {
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message || "Falha ao carregar.");
        return;
      }

      setData(json);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to, take, skip, topWindowDays]);

  const filteredItems = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return data.items;

    return data.items.filter((it) => {
      const ced = it.cedente;
      const p = it.purchase;
      const hay = [it.id, ced?.nomeCompleto, ced?.cpf, ced?.identificador, p?.numero, it.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [data.items, q]);

  const pageSum = useMemo(() => {
    return filteredItems.reduce((acc, it) => acc + (it.amountCents || 0), 0);
  }, [filteredItems]);

  const topRecebedores = data.topRecebedores || [];

  const totalPages = useMemo(() => {
    const t = data?.total || 0;
    const tk = data?.take || take || 50;
    return Math.max(1, Math.ceil(t / tk));
  }, [data.total, data.take, take]);

  const currentPage = useMemo(() => {
    const tk = data?.take || take || 50;
    return Math.floor((data?.skip || 0) / tk) + 1;
  }, [data.skip, data.take, take]);

  async function payCommission(id: string) {
    const note = window.prompt("Observação (opcional):", "") ?? "";
    if (!window.confirm("Confirmar: marcar esta comissão como PAGA?")) return;

    try {
      setLoading(true);
      setErr("");
      const res = await fetch(`/api/cedente-commissions/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message || "Falha ao pagar comissão.");
        return;
      }
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro inesperado ao pagar.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelCommission(id: string) {
    const note = window.prompt("Motivo/observação (opcional):", "") ?? "";
    if (!window.confirm("Confirmar: cancelar esta comissão?")) return;

    try {
      setLoading(true);
      setErr("");
      const res = await fetch(`/api/cedente-commissions/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json?.message || "Falha ao cancelar comissão.");
        return;
      }
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro inesperado ao cancelar.");
    } finally {
      setLoading(false);
    }
  }

  function resetPaging() {
    setSkip(0);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Lucros & Comissões
            </div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">
              Comissões · Cedentes
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Filtre, confira e marque como paga ou cancelada.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              onClick={() => {
                setStatus("PENDING");
                setFrom("");
                setTo("");
                setQ("");
                setTake(50);
                setSkip(0);
              }}
              disabled={loading}
            >
              Limpar filtros
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 text-white">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                No filtro
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{data.total}</div>
              <div className="text-xs text-slate-500">comissões no backend</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Soma desta lista
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{fmtMoneyBR(pageSum)}</div>
              <div className="text-xs text-slate-500">página / busca local</div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nesta página
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                {filteredItems.length}
              </div>
              <div className="text-xs text-slate-500">linhas visíveis</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "PENDING" as Status, label: "Pendentes" },
              { id: "PAID" as Status, label: "Pagas" },
              { id: "CANCELED" as Status, label: "Canceladas" },
              { id: "" as Status, label: "Todas" },
            ]
          ).map((opt) => (
            <button
              key={opt.id || "all"}
              type="button"
              onClick={() => {
                setStatus(opt.id);
                resetPaging();
              }}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-semibold transition",
                status === opt.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Buscar
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className={cn(INPUT, "pl-9")}
                placeholder="Nome, CPF, ID ou nº da compra"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">De</label>
            <input
              type="date"
              className={cn(INPUT, "mt-1")}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                resetPaging();
              }}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Até</label>
            <input
              type="date"
              className={cn(INPUT, "mt-1")}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                resetPaging();
              }}
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Por página
            </label>
            <select
              className={cn(INPUT, "mt-1")}
              value={take}
              onChange={(e) => {
                setTake(Number(e.target.value));
                resetPaging();
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr>
                <th className={TH}>Status</th>
                <th className={TH}>Cedente</th>
                <th className={TH}>Compra</th>
                <th className={TH}>Valor</th>
                <th className={TH}>Gerada em</th>
                <th className={TH}>Paga em</th>
                <th className={TH}>Obs.</th>
                <th className={cn(TH, "text-right")}>Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={8}>
                    Carregando comissões…
                  </td>
                </tr>
              ) : null}

              {!loading && filteredItems.length === 0 ? (
                <tr>
                  <td className="px-4 py-12 text-center text-slate-500" colSpan={8}>
                    Nenhuma comissão encontrada.
                  </td>
                </tr>
              ) : null}

              {filteredItems.map((it) => (
                <tr key={it.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-4 py-3.5">{statusBadge(it.status)}</td>
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-900">{it.cedente?.nomeCompleto || "—"}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {it.cedente?.identificador ? `${it.cedente.identificador} · ` : ""}
                      {it.cedente?.cpf || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{it.purchase?.numero || "—"}</div>
                    {it.purchase?.status ? (
                      <div className="text-xs text-slate-400">{it.purchase.status}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums text-slate-900">
                    {fmtMoneyBR(it.amountCents)}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-slate-600">
                    {fmtDateTimeBR(it.generatedAt)}
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-slate-600">{fmtDateTimeBR(it.paidAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="max-w-[240px] truncate text-slate-600" title={it.note || ""}>
                      {it.note || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        className="h-8 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                        onClick={() => void payCommission(it.id)}
                        disabled={loading || it.status !== "PENDING"}
                        title={
                          it.status !== "PENDING" ? "Somente pendente pode ser paga" : "Marcar como paga"
                        }
                      >
                        Pagar
                      </button>
                      <button
                        type="button"
                        className="h-8 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-40"
                        onClick={() => void cancelCommission(it.id)}
                        disabled={loading || it.status !== "PENDING"}
                        title={
                          it.status !== "PENDING"
                            ? "Somente pendente pode ser cancelada"
                            : "Cancelar"
                        }
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
          <div className="text-slate-500">
            Página <span className="font-semibold text-slate-900">{currentPage}</span> de{" "}
            <span className="font-semibold text-slate-900">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
              disabled={loading || skip <= 0}
              onClick={() => setSkip(Math.max(0, skip - take))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
              disabled={loading || skip + take >= (data.total || 0)}
              onClick={() => setSkip(skip + take)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Quem mais recebeu dinheiro</h2>
            <p className="text-sm text-slate-500">Comissões pagas por cedente no período.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[30, 60, 90, 180, 365].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setTopWindowDays(days)}
                className={cn(
                  "h-9 rounded-full px-3 text-xs font-semibold transition",
                  topWindowDays === days
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {days === 365 ? "1 ano" : `${days} dias`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Cedente</th>
                <th className={TH}>ID</th>
                <th className={TH}>CPF</th>
                <th className={TH}>Qtd. pagas</th>
                <th className={TH}>Total recebido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topRecebedores.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={6}>
                    Nenhuma comissão paga neste período.
                  </td>
                </tr>
              ) : (
                topRecebedores.map((item, idx) => (
                  <tr
                    key={item.cedenteId || `sem-cedente-${item.totalCents}`}
                    className="hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 text-xs font-semibold text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {item.cedente?.nomeCompleto || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.cedente?.identificador || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{item.cedente?.cpf || "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{item.count}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                      {fmtMoneyBR(item.totalCents)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
