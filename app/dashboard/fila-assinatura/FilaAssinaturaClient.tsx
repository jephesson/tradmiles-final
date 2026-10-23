"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  ListChecks,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { VerificationCodeFetch } from "@/components/cedentes/VerificationCodeFetch";
import { EmailNaoSincronizadoAviso } from "@/components/cedentes/EmailNaoSincronizadoAviso";
import {
  VP_FIELD_LABEL,
  VP_MODAL_BACKDROP,
  VP_MODAL_PANEL,
} from "@/app/dashboard/cedentes/visualizar/visualizarPontosUi";

type Status = "AGUARDANDO" | "ASSINADO" | "ERRO";

type CedenteLite = {
  id: string;
  nome: string;
  identificador: string;
  cpfMask: string;
  telefone: string | null;
  responsavel: { id: string; name: string } | null;
};

type Credenciais = {
  id: string;
  nomeCompleto: string;
  identificador: string;
  cpf: string;
  emailCriado: string | null;
  senhaEmail: string | null;
  senhaLatamPass: string | null;
  senhaLivelo: string | null;
  emailRedirecionado: boolean;
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

const STATUS_META: Record<Status, { label: string; select: string; badge: string }> = {
  AGUARDANDO: {
    label: "Aguardando",
    select: "bg-amber-50 text-amber-900 ring-amber-300",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  ASSINADO: {
    label: "Assinado",
    select: "bg-emerald-50 text-emerald-900 ring-emerald-300",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  ERRO: {
    label: "Erro",
    select: "bg-red-50 text-red-800 ring-red-300",
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
const GRID_COLS_ADMIN = "lg:grid-cols-[1.5rem_minmax(0,1fr)_7rem_9rem_9rem_13.5rem]";
const GRID_COLS_STAFF = "lg:grid-cols-[1.5rem_minmax(0,1fr)_7rem_9rem_9rem_8rem]";

const ICON_BTN =
  "group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 transition-colors";
const ICON_BTN_NEUTRAL = cn(ICON_BTN, "bg-white text-slate-600 ring-slate-200/90 hover:bg-slate-50 hover:text-slate-900");
const ICON_BTN_WHATS = cn(ICON_BTN, "bg-emerald-50 text-emerald-700 ring-emerald-200/90 hover:bg-emerald-100");

function whatsappHref(telefone?: string | null) {
  let d = String(telefone || "").replace(/\D+/g, "");
  if (!d) return null;
  while (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;
  return `https://wa.me/${d}`;
}

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

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
  const m = STATUS_META[props.value];
  if (!props.canEdit) {
    return (
      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", m.badge)}>
        {m.label}
      </span>
    );
  }
  return (
    <select
      aria-label={props.program}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value as Status)}
      className={cn(
        "h-9 w-full cursor-pointer rounded-lg border-0 px-2.5 text-xs font-semibold outline-none ring-1 focus:ring-2",
        m.select
      )}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-3">
      <div className={VP_FIELD_LABEL}>{label}</div>
      <div className="mt-1 break-all font-medium text-slate-900">{value || "-"}</div>
      {value ? (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            } catch {
              /* ignore */
            }
          }}
          className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
        >
          <Copy size={13} /> {copied ? "Copiado" : "Copiar"}
        </button>
      ) : null}
    </div>
  );
}

/** Mesmas credenciais da tela de cedentes, com a senha Livelo junto e o código da LATAM. */
function CredenciaisModal(props: { itemId: string; onClose: () => void }) {
  const [data, setData] = useState<Credenciais | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api<{ credenciais: Credenciais }>(`/api/fila-assinatura?credenciais=${encodeURIComponent(props.itemId)}`)
      .then((d) => alive && setData(d.credenciais))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Falha ao abrir credenciais."));
    return () => {
      alive = false;
    };
  }, [props.itemId]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className={VP_MODAL_BACKDROP} aria-label="Fechar credenciais" onClick={props.onClose} />
      <div className={cn(VP_MODAL_PANEL, "max-h-[90vh] overflow-y-auto")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900">Credenciais para transação</div>
            {data ? (
              <div className="text-sm text-slate-500">
                {data.nomeCompleto} • {data.identificador}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        {!data && !error ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Abrindo…
          </div>
        ) : null}

        {data ? (
          <>
            <EmailNaoSincronizadoAviso
              className="mb-4"
              cedenteId={data.id}
              emailRedirecionado={data.emailRedirecionado}
              onMarked={() => setData((prev) => (prev ? { ...prev, emailRedirecionado: true } : prev))}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CopyField label="CPF (login)" value={data.cpf} />
              <CopyField label="Senha LATAM" value={data.senhaLatamPass} />
              <CopyField label="Senha Livelo" value={data.senhaLivelo} />
              <CopyField label="E-mail" value={data.emailCriado} />
              <CopyField label="Senha do e-mail" value={data.senhaEmail} />
            </div>
            <VerificationCodeFetch className="mt-4" cedenteId={data.id} program="LATAM" email={data.emailCriado} />
          </>
        ) : null}
      </div>
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
  const [credItemId, setCredItemId] = useState<string | null>(null);

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
          <span>Ações</span>
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
              const waHref = whatsappHref(item.cedente.telefone);
              const busy = busyId === item.id;
              return (
                <li
                  key={item.id}
                  className={cn(
                    "grid grid-cols-2 items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:px-5 lg:gap-x-4 lg:gap-y-0",
                    GRID_COLS,
                    allSigned && "bg-emerald-50/40",
                    busy && "opacity-60"
                  )}
                >
                  <span className="hidden text-sm font-semibold tabular-nums text-slate-400 lg:block">{idx + 1}</span>

                  <div className="col-span-2 min-w-0 lg:col-span-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      <span className="mr-1.5 text-slate-400 lg:hidden">{idx + 1}.</span>
                      {item.cedente.nome}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.cedente.identificador}
                      {item.cedente.cpfMask ? ` • CPF ${item.cedente.cpfMask}` : ""}
                      {item.cedente.responsavel ? ` • ${item.cedente.responsavel.name}` : ""}
                    </p>
                  </div>

                  <div className="col-span-2 min-w-0 text-xs leading-tight text-slate-500 lg:col-span-1">
                    <span className="font-medium text-slate-700">{firstName(item.addedBy.name)}</span>
                    <span className="ml-1 lg:ml-0 lg:block">{fmtWhen(item.createdAt)}</span>
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500 lg:hidden">LATAM Pass</span>
                    <StatusControl
                      program="LATAM Pass"
                      value={item.latamStatus}
                      canEdit={isAdmin}
                      onChange={(s) => void setStatus(item, "latamStatus", s)}
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500 lg:hidden">Livelo</span>
                    <StatusControl
                      program="Livelo"
                      value={item.liveloStatus}
                      canEdit={isAdmin}
                      onChange={(s) => void setStatus(item, "liveloStatus", s)}
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-1.5 lg:col-span-1">
                    {waHref ? (
                      <a href={waHref} target="_blank" rel="noreferrer" className={ICON_BTN_WHATS} title="WhatsApp do cedente">
                        <MessageCircle size={15} />
                        <span className="sr-only">WhatsApp</span>
                        <Tip label="WhatsApp" />
                      </a>
                    ) : (
                      <span
                        className={cn(ICON_BTN, "cursor-not-allowed bg-slate-50 text-slate-300 ring-slate-200/70")}
                        title="Cedente sem telefone"
                      >
                        <MessageCircle size={15} />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCredItemId(item.id)}
                      className={ICON_BTN_NEUTRAL}
                      title="Credenciais e código de verificação"
                    >
                      <KeyRound size={15} />
                      <span className="sr-only">Credenciais</span>
                      <Tip label="CPF/E-mail/Senhas/Código" />
                    </button>

                    {isAdmin ? (
                      <select
                        aria-label={`Ações para ${item.cedente.nome}`}
                        value=""
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "REMOVER") void remove(item);
                          else if (v === "EXCLUIR") void deleteCadastro(item);
                          else if (v) void close(item, v as Resultado);
                        }}
                        className={cn(
                          "h-9 min-w-0 flex-1 cursor-pointer rounded-lg border-0 px-2.5 text-xs font-semibold outline-none ring-1 focus:ring-2",
                          allSigned
                            ? "bg-emerald-600 text-white ring-emerald-600"
                            : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                        )}
                      >
                        <option value="" disabled>
                          {busy ? "Salvando…" : allSigned ? "Concluir…" : "Fechar como…"}
                        </option>
                        <optgroup label="Fechar (sai da fila)">
                          <option value="CONCLUIDO">✓ Concluído</option>
                          <option value="NEGADO">⊘ Negado</option>
                          <option value="SEM_RESPOSTA">… Sem resposta</option>
                        </optgroup>
                        <optgroup label="Outros">
                          <option value="REMOVER">Tirar da fila</option>
                          <option value="EXCLUIR">Excluir todo o cadastro</option>
                        </optgroup>
                      </select>
                    ) : canRemove ? (
                      <button
                        type="button"
                        aria-label="Tirar da fila"
                        disabled={busy}
                        onClick={() => void remove(item)}
                        className={cn(ICON_BTN_NEUTRAL, "hover:bg-red-50 hover:text-red-600")}
                      >
                        <Trash2 size={15} />
                        <Tip label="Tirar da fila" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {credItemId ? <CredenciaisModal itemId={credItemId} onClose={() => setCredItemId(null)} /> : null}
    </div>
  );
}
