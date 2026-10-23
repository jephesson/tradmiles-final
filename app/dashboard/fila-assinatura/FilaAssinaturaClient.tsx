"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, ListChecks, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Status = "AGUARDANDO" | "ASSINADO" | "ERRO";

type CedenteLite = {
  id: string;
  nome: string;
  identificador: string;
  cpfMask: string;
  responsavel: { id: string; name: string } | null;
};

type Item = {
  id: string;
  latamStatus: Status;
  liveloStatus: Status;
  note: string;
  createdAt: string;
  addedBy: { id: string; name: string };
  cedente: CedenteLite;
};

const STATUS_META: Record<Status, { label: string; on: string; badge: string }> = {
  AGUARDANDO: {
    label: "Aguardando",
    on: "bg-amber-500 text-white border-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  ASSINADO: {
    label: "Assinado",
    on: "bg-emerald-600 text-white border-emerald-600",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  ERRO: {
    label: "Erro",
    on: "bg-red-600 text-white border-red-600",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
};
const STATUS_ORDER: Status[] = ["AGUARDANDO", "ASSINADO", "ERRO"];

function fmtWhen(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(json?.error || "Algo deu errado.");
  return json.data as T;
}

function StatusControl(props: {
  program: string;
  value: Status;
  canEdit: boolean;
  onChange: (s: Status) => void;
}) {
  if (!props.canEdit) {
    const m = STATUS_META[props.value];
    return (
      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", m.badge)}>
        {m.label}
      </span>
    );
  }
  return (
    <div role="radiogroup" aria-label={props.program} className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {STATUS_ORDER.map((s) => {
        const on = props.value === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => !on && props.onChange(s)}
            className={cn(
              "rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
              on ? STATUS_META[s].on : "border-transparent text-slate-500 hover:bg-slate-100"
            )}
          >
            {STATUS_META[s].label}
          </button>
        );
      })}
    </div>
  );
}

function AddToQueue(props: { onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<CedenteLite & { naFila: boolean }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const req = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const my = ++req.current;
    const t = window.setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api<{ cedentes: Array<CedenteLite & { naFila: boolean }> }>(
          `/api/fila-assinatura?busca=${encodeURIComponent(term)}`
        );
        if (my === req.current) setResults(data.cedentes);
      } catch (e: unknown) {
        if (my === req.current) setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha na busca." });
      } finally {
        if (my === req.current) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q]);

  async function add(c: CedenteLite) {
    setAdding(c.id);
    setMsg(null);
    try {
      await api("/api/fila-assinatura", { method: "POST", body: JSON.stringify({ cedenteId: c.id }) });
      setMsg({ kind: "ok", text: `${c.nome} entrou na fila.` });
      setQ("");
      setResults(null);
      props.onAdded();
    } catch (e: unknown) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Não deu para adicionar." });
    } finally {
      setAdding(null);
    }
  }

  const showResults = q.trim().length >= 2 && results !== null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <label htmlFor="fila-busca" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Colocar cedente na fila
      </label>
      <div className="relative mt-2">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-slate-400 focus-within:bg-white">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            id="fila-busca"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setMsg(null);
              if (e.target.value.trim().length < 2) setResults(null);
            }}
            placeholder="Nome, identificador ou CPF…"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            autoComplete="off"
          />
          {searching ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>

        {showResults ? (
          <ul className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">Nenhum cedente encontrado.</li>
            ) : (
              results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={c.naFila || !!adding}
                    onClick={() => void add(c)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{c.nome}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.identificador}
                        {c.cpfMask ? ` • CPF: ${c.cpfMask}` : ""}
                        {c.responsavel ? ` • ${c.responsavel.name}` : ""}
                      </span>
                    </span>
                    {c.naFila ? (
                      <span className="shrink-0 text-xs font-semibold text-slate-400">Já na fila</span>
                    ) : adding === c.id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white">
                        <Plus className="h-3.5 w-3.5" /> Colocar
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
      {msg ? (
        <p
          className={cn(
            "mt-2 text-sm font-medium",
            msg.kind === "ok" ? "text-emerald-700" : "text-red-600"
          )}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

export default function FilaAssinaturaClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ items: Item[]; isAdmin: boolean; meId: string }>("/api/fila-assinatura");
      setItems(data.items);
      setIsAdmin(data.isAdmin);
      setMeId(data.meId);
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a fila.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function setStatus(item: Item, field: "latamStatus" | "liveloStatus", value: Status) {
    const before = items;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, [field]: value } : i)));
    try {
      await api(`/api/fila-assinatura?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
    } catch (e: unknown) {
      setItems(before);
      alert(e instanceof Error ? e.message : "Não deu para salvar.");
    }
  }

  async function conclude(item: Item) {
    const allSigned = item.latamStatus === "ASSINADO" && item.liveloStatus === "ASSINADO";
    if (!allSigned && !confirm(`${item.cedente.nome} ainda não está assinado nos dois. Concluir mesmo assim?`)) {
      return;
    }
    setBusyId(item.id);
    try {
      await api(`/api/fila-assinatura?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ concluir: true }),
      });
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Não deu para concluir.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: Item) {
    if (!confirm(`Tirar ${item.cedente.nome} da fila?`)) return;
    setBusyId(item.id);
    try {
      await api(`/api/fila-assinatura?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Não deu para tirar da fila.");
    } finally {
      setBusyId(null);
    }
  }

  const withError = items.filter((i) => i.latamStatus === "ERRO" || i.liveloStatus === "ERRO").length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            <ListChecks className="h-3.5 w-3.5" /> Cedentes
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Fila de assinatura</h1>
          <p className="mt-1 text-sm text-slate-600">
            Coloque o cedente na fila. {isAdmin ? "Você" : "O admin"} marca LATAM Pass e Livelo e conclui; o
            concluído sai da fila.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
        </button>
      </div>

      <AddToQueue onAdded={() => void load()} />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-sm font-semibold text-slate-900">
            {items.length} {items.length === 1 ? "cedente na fila" : "cedentes na fila"}
          </p>
          {withError ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
              {withError} com erro
            </span>
          ) : null}
        </div>

        <div className="hidden grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_9.5rem] items-center gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
          <span>#</span>
          <span>Cedente</span>
          <span>Colocado por</span>
          <span className="w-[13.5rem]">LATAM Pass</span>
          <span className="w-[13.5rem]">Livelo</span>
          <span className="text-right">Ações</span>
        </div>

        {error ? <p className="px-5 py-4 text-sm font-medium text-red-600">{error}</p> : null}

        {loading && !items.length ? (
          <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando fila…
          </div>
        ) : !items.length && !error ? (
          <div className="px-5 py-14 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-medium text-slate-700">Fila vazia</p>
            <p className="text-sm text-slate-500">Busque um cedente acima para colocar na fila.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item, idx) => {
              const allSigned = item.latamStatus === "ASSINADO" && item.liveloStatus === "ASSINADO";
              const canRemove = isAdmin || item.addedBy.id === meId;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "grid gap-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_auto_auto_9.5rem] lg:items-center lg:gap-4",
                    allSigned && "bg-emerald-50/40"
                  )}
                >
                  <span className="hidden text-sm font-semibold tabular-nums text-slate-400 lg:block">{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      <span className="mr-1.5 text-slate-400 lg:hidden">{idx + 1}.</span>
                      {item.cedente.nome}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.cedente.identificador}
                      {item.cedente.cpfMask ? ` • CPF: ${item.cedente.cpfMask}` : ""}
                    </p>
                    {item.cedente.responsavel ? (
                      <p className="truncate text-xs text-slate-500">Resp.: {item.cedente.responsavel.name}</p>
                    ) : null}
                  </div>
                  <div className="min-w-0 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{firstName(item.addedBy.name)}</span>
                    <span className="block">{fmtWhen(item.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 lg:block lg:w-[13.5rem]">
                    <span className="text-xs font-semibold text-slate-500 lg:hidden">LATAM Pass</span>
                    <StatusControl
                      program="LATAM Pass"
                      value={item.latamStatus}
                      canEdit={isAdmin}
                      onChange={(s) => void setStatus(item, "latamStatus", s)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 lg:block lg:w-[13.5rem]">
                    <span className="text-xs font-semibold text-slate-500 lg:hidden">Livelo</span>
                    <StatusControl
                      program="Livelo"
                      value={item.liveloStatus}
                      canEdit={isAdmin}
                      onChange={(s) => void setStatus(item, "liveloStatus", s)}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    {isAdmin ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void conclude(item)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-50",
                          allSigned
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {busyId === item.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Concluído
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button
                        type="button"
                        aria-label="Tirar da fila"
                        title="Tirar da fila"
                        disabled={busyId === item.id}
                        onClick={() => void remove(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
