"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  ListChecks,
  Loader2,
  MessageCircleOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserX,
} from "lucide-react";
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

type Resultado = "CONCLUIDO" | "NEGADO" | "SEM_RESPOSTA";

const RESULT_LABEL: Record<Resultado, string> = {
  CONCLUIDO: "Concluído",
  NEGADO: "Negado",
  SEM_RESPOSTA: "Sem resposta",
};

// Larguras fixas nas colunas de status/ações para as linhas alinharem com o cabeçalho.
const GRID_COLS_ADMIN = "lg:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_12.5rem_12.5rem_24rem]";
const GRID_COLS_STAFF = "lg:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_12.5rem_12.5rem_2.5rem]";

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

  async function close(item: Item, resultado: Resultado) {
    const allSigned = item.latamStatus === "ASSINADO" && item.liveloStatus === "ASSINADO";
    const question =
      resultado === "CONCLUIDO"
        ? allSigned
          ? null
          : `${item.cedente.nome} ainda não está assinado nos dois. Concluir mesmo assim?`
        : `Fechar ${item.cedente.nome} como "${RESULT_LABEL[resultado]}"? Sai da fila.`;
    if (question && !confirm(question)) return;
    setBusyId(item.id);
    try {
      await api(`/api/fila-assinatura?id=${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ resultado }),
      });
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Não deu para fechar.");
    } finally {
      setBusyId(null);
    }
  }

  // Apaga o cadastro do cedente inteiro (mesma rota da tela de cedentes, com senha).
  async function deleteCadastro(item: Item) {
    if (
      !confirm(
        `Excluir TODO o cadastro de ${item.cedente.nome}?\n\nIsso apaga o cedente do sistema, não só da fila, e não dá para desfazer.`
      )
    ) {
      return;
    }
    const password = (prompt("Digite sua senha do login para confirmar:") ?? "").trim();
    if (!password) return;
    setBusyId(item.id);
    try {
      const res = await fetch("/api/cedentes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [item.cedente.id], password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Não deu para excluir o cadastro.");
      if (!json.deleted) throw new Error("Cadastro não encontrado.");
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Não deu para excluir o cadastro.");
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

  const GRID_COLS = isAdmin ? GRID_COLS_ADMIN : GRID_COLS_STAFF;
  const withError = items.filter((i) => i.latamStatus === "ERRO" || i.liveloStatus === "ERRO").length;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            <ListChecks className="h-3.5 w-3.5" /> Cedentes
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Fila de assinatura</h1>
          <p className="mt-1 text-sm text-slate-600">
            Coloque o cedente na fila. {isAdmin ? "Você" : "O admin"} marca LATAM Pass e Livelo e fecha
            como concluído, negado ou sem resposta; o que é fechado sai da fila.
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

        <div
          className={cn(
            "hidden items-center gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid",
            GRID_COLS
          )}
        >
          <span>#</span>
          <span>Cedente</span>
          <span>Colocado por</span>
          <span>LATAM Pass</span>
          <span>Livelo</span>
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
                    "grid gap-3 px-4 py-3.5 sm:px-5 lg:items-center lg:gap-4",
                    GRID_COLS,
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
                  <div className="flex items-center justify-between gap-3 lg:block">
                    <span className="text-xs font-semibold text-slate-500 lg:hidden">LATAM Pass</span>
                    <StatusControl
                      program="LATAM Pass"
                      value={item.latamStatus}
                      canEdit={isAdmin}
                      onChange={(s) => void setStatus(item, "latamStatus", s)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 lg:block">
                    <span className="text-xs font-semibold text-slate-500 lg:hidden">Livelo</span>
                    <StatusControl
                      program="Livelo"
                      value={item.liveloStatus}
                      canEdit={isAdmin}
                      onChange={(s) => void setStatus(item, "liveloStatus", s)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void close(item, "CONCLUIDO")}
                          className={cn(
                            "inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors disabled:opacity-50",
                            allSigned
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          )}
                        >
                          {busyId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Concluído
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void close(item, "NEGADO")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Negado
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => void close(item, "SEM_RESPOSTA")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                        >
                          <MessageCircleOff className="h-3.5 w-3.5" />
                          Sem resposta
                        </button>
                      </>
                    ) : null}
                    {canRemove ? (
                      <button
                        type="button"
                        aria-label="Tirar da fila"
                        title="Tirar da fila"
                        disabled={busyId === item.id}
                        onClick={() => void remove(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button
                        type="button"
                        aria-label="Excluir todo o cadastro"
                        title="Excluir todo o cadastro do cedente"
                        disabled={busyId === item.id}
                        onClick={() => void deleteCadastro(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <UserX className="h-4 w-4" />
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
