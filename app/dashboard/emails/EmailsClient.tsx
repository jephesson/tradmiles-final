"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookmarkPlus,
  Inbox,
  Link2,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Trash2,
  Unlink,
  User,
  UserX,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Program = "SMILES" | "LATAM" | "LIVELO";
type ProgramFilter = "ALL" | Program;
type Scope = "all" | "matched" | "unmatched";
type SearchIn = "subject" | "anywhere";

type SavedFilter = {
  id: string;
  name: string;
  query: string;
  searchIn: SearchIn;
  program: ProgramFilter;
};

const SAVED_FILTERS_KEY = "tm.emailSavedFilters";

function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedFilter[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f) => f && f.id && f.name && typeof f.query === "string")
      .map((f) => ({
        id: String(f.id),
        name: String(f.name),
        query: String(f.query),
        searchIn: f.searchIn === "subject" ? "subject" : "anywhere",
        program: (["ALL", "SMILES", "LATAM", "LIVELO"] as const).includes(
          f.program as ProgramFilter
        )
          ? (f.program as ProgramFilter)
          : "ALL",
      }));
  } catch {
    return [];
  }
}

function persistSavedFilters(filters: SavedFilter[]) {
  localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
}

type CedenteRef = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  email: string;
};

type Row = {
  id: string;
  threadId: string;
  program: Program | null;
  fromName: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  date: string | null;
  unread: boolean;
  cedente: CedenteRef | null;
};

type ListResp = {
  ok: true;
  configured: boolean;
  canConnect?: boolean;
  isAdmin?: boolean;
  mailbox?: string | null;
  source?: "db" | "env" | "none";
  rows: Row[];
  nextPageToken: string | null;
  summary: { total: number; matched: number; unmatched: number };
};

type Detail = {
  id: string;
  program: Program | null;
  fromName: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: string | null;
  document: string;
  cedente: CedenteRef | null;
};

const CONTROL =
  "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

const PROGRAM_TABS: { value: ProgramFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "SMILES", label: "Smiles" },
  { value: "LATAM", label: "LATAM" },
  { value: "LIVELO", label: "Livelo" },
];

const PROGRAM_STYLE: Record<Program, string> = {
  SMILES: "bg-orange-50 text-orange-700 ring-orange-200",
  LATAM: "bg-rose-50 text-rose-700 ring-rose-200",
  LIVELO: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
};

const WINDOW_OPTIONS = [
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 180, label: "180 dias" },
  { value: 365, label: "1 ano" },
];

function fmtDateTimeBR(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;

  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ProgramBadge({ program }: { program: Program | null }) {
  if (!program) {
    return (
      <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
        Outro
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1",
        PROGRAM_STYLE[program]
      )}
    >
      {program === "LATAM" ? "LATAM" : program === "SMILES" ? "Smiles" : "Livelo"}
    </span>
  );
}

function oauthMessage(code: string | null, detail: string | null): string | null {
  if (!code) return null;
  if (code === "connected") return "Gmail conectado. A caixa já está disponível.";
  if (code === "admin_only") return "Apenas admin pode conectar ou desconectar o Gmail.";
  if (code === "missing_client") {
    return "Falta configurar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET na Vercel.";
  }
  if (code === "denied") return "Login no Google cancelado.";
  if (code === "state") return "Sessão de login expirou. Clique em Conectar Gmail de novo.";
  if (code === "invalid") return "Retorno inválido do Google. Tente conectar de novo.";
  if (code === "error") return detail || "Falha ao conectar o Gmail.";
  return null;
}

function SetupPanel({
  canConnect,
  isAdmin,
}: {
  canConnect: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="space-y-2 text-sm text-amber-900">
            <div className="text-[15px] font-semibold">Gmail ainda não conectado</div>
            <p>
              Clique em <b>Conectar Gmail</b>, faça login na sua conta e autorize. Fica conectado
              automaticamente — os e-mails continuam no Gmail; aqui só guardamos o token de acesso.
            </p>
            {!canConnect ? (
              <p className="text-amber-800">
                Antes disso, coloque <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_ID</code> e{" "}
                <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_SECRET</code> na Vercel
                (e no Google Cloud cadastre o redirect{" "}
                <code className="rounded bg-amber-100 px-1">/api/emails/oauth/callback</code>).
              </p>
            ) : null}
            {!isAdmin ? (
              <p className="text-amber-800">Peça a um admin para conectar a conta.</p>
            ) : null}
          </div>
        </div>

        {isAdmin && canConnect ? (
          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/emails/oauth/start";
            }}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Link2 className="h-4 w-4" aria-hidden />
            Conectar Gmail
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CedenteFilter({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (id: string, label: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [options, setOptions] = useState<CedenteRef[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/emails/filtros/cedentes?q=${encodeURIComponent(term)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        setOptions(json?.ok ? (json.options as CedenteRef[]) : []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(handle);
  }, [term, open]);

  if (value) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-sm text-sky-900">
        <User className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        <span className="truncate font-medium">{label}</span>
        <button
          type="button"
          onClick={() => {
            onChange("", "");
            setTerm("");
          }}
          className="ml-auto rounded-md p-1 text-sky-700 transition hover:bg-sky-100"
          aria-label="Limpar filtro de cedente"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Filtrar por cedente…"
        className={cn(CONTROL, "w-full")}
      />

      {open ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Buscando…
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">Nenhum cedente com e-mail.</div>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option.id, option.nomeCompleto);
                  setOpen(false);
                  setTerm("");
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100"
              >
                <div className="truncate font-medium text-slate-900">{option.nomeCompleto}</div>
                <div className="truncate text-xs text-slate-500">
                  {option.identificador} · {option.email}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function EmailsClient() {
  const [oauthBanner, setOauthBanner] = useState<string | null>(null);
  const [oauthOk, setOauthOk] = useState(false);

  const [program, setProgram] = useState<ProgramFilter>("ALL");
  const [scope, setScope] = useState<Scope>("all");
  const [cedenteId, setCedenteId] = useState("");
  const [cedenteLabel, setCedenteLabel] = useState("");
  const [search, setSearch] = useState("");
  const [searchIn, setSearchIn] = useState<SearchIn>("anywhere");
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [days, setDays] = useState(180);

  const [configured, setConfigured] = useState(true);
  const [canConnect, setCanConnect] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ total: 0, matched: 0, unmatched: 0 });
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Evita que uma resposta lenta de um filtro antigo sobrescreva a atual.
  const requestRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("oauth");
    const detail = params.get("detail");
    const message = oauthMessage(code, detail);
    if (message) {
      setOauthBanner(message);
      setOauthOk(code === "connected");
      window.history.replaceState({}, "", "/dashboard/emails");
    }
    setSavedFilters(loadSavedFilters());
  }, []);

  const buildQuery = useCallback(
    (pageToken?: string) => {
      const params = new URLSearchParams();
      params.set("program", program);
      params.set("scope", scope);
      params.set("days", String(days));
      params.set("searchIn", searchIn);
      if (cedenteId) params.set("cedenteId", cedenteId);
      if (search.trim()) params.set("q", search.trim());
      if (pageToken) params.set("pageToken", pageToken);
      return params.toString();
    },
    [program, scope, days, cedenteId, search, searchIn]
  );

  const applySavedFilter = useCallback((filter: SavedFilter) => {
    setActiveFilterId(filter.id);
    setSearch(filter.query);
    setSearchIn(filter.searchIn);
    setProgram(filter.program);
  }, []);

  const saveCurrentFilter = useCallback(() => {
    const query = search.trim();
    if (!query) {
      alert("Digite um texto ou código para salvar o filtro.");
      return;
    }

    const name = window.prompt(
      "Nome do filtro (ex.: Código no assunto, Biometria, Confirmação):",
      searchIn === "subject" ? `Assunto: ${query}` : `Texto: ${query}`
    );
    if (!name?.trim()) return;

    const next: SavedFilter = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim().slice(0, 60),
      query,
      searchIn,
      program,
    };

    setSavedFilters((prev) => {
      const merged = [next, ...prev].slice(0, 30);
      persistSavedFilters(merged);
      return merged;
    });
    setActiveFilterId(next.id);
  }, [search, searchIn, program]);

  const removeSavedFilter = useCallback((id: string) => {
    setSavedFilters((prev) => {
      const merged = prev.filter((f) => f.id !== id);
      persistSavedFilters(merged);
      return merged;
    });
    setActiveFilterId((cur) => (cur === id ? null : cur));
  }, []);

  const load = useCallback(async () => {
    const ticket = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/emails?${buildQuery()}`, { cache: "no-store" });
      const json = (await res.json()) as ListResp | { ok: false; error: string };

      if (ticket !== requestRef.current) return;

      if (!("ok" in json) || !json.ok) {
        setError(("error" in json && json.error) || "Falha ao carregar os e-mails.");
        setRows([]);
        return;
      }

      setConfigured(json.configured);
      setCanConnect(Boolean(json.canConnect));
      setIsAdmin(Boolean(json.isAdmin));
      setMailbox(json.mailbox ?? null);
      setRows(json.rows);
      setSummary(json.summary);
      setNextPageToken(json.nextPageToken);
    } catch (err) {
      if (ticket !== requestRef.current) return;
      setError(err instanceof Error ? err.message : "Falha ao carregar os e-mails.");
    } finally {
      if (ticket === requestRef.current) setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    const handle = setTimeout(load, 300);
    return () => clearTimeout(handle);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextPageToken) return;
    setLoadingMore(true);

    try {
      const res = await fetch(`/api/emails?${buildQuery(nextPageToken)}`, { cache: "no-store" });
      const json = (await res.json()) as ListResp | { ok: false; error: string };

      if (!("ok" in json) || !json.ok) return;

      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...json.rows.filter((r) => !seen.has(r.id))];
      });
      setNextPageToken(json.nextPageToken);
      setSummary((prev) => ({
        total: prev.total + json.summary.total,
        matched: prev.matched + json.summary.matched,
        unmatched: prev.unmatched + json.summary.unmatched,
      }));
    } finally {
      setLoadingMore(false);
    }
  }, [buildQuery, nextPageToken]);

  const disconnect = useCallback(async () => {
    if (!confirm("Desconectar o Gmail desta página?")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/emails/oauth/disconnect", { method: "POST" });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.error || "Falha ao desconectar.");
        return;
      }
      setConfigured(false);
      setMailbox(null);
      setRows([]);
      setSelectedId(null);
      setDetail(null);
      await load();
    } finally {
      setDisconnecting(false);
    }
  }, [load]);

  const openMessage = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();

      if (!json?.ok) {
        setDetailError(json?.error || "Falha ao abrir o e-mail.");
        return;
      }

      setDetail(json.message as Detail);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Falha ao abrir o e-mail.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** Agrupa por cedente para dar noção de volume por pessoa. */
  const topCedentes = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();

    for (const row of rows) {
      if (!row.cedente) continue;
      const current = counts.get(row.cedente.id);
      if (current) current.count += 1;
      else counts.set(row.cedente.id, { name: row.cedente.nomeCompleto, count: 1 });
    }

    return Array.from(counts.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Mail className="h-5 w-5 text-slate-500" aria-hidden />
            E-mail
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Caixa filtrada de Smiles, LATAM e Livelo
            {mailbox ? ` · ${mailbox}` : ""}, cruzada com o cedente pelo e-mail cadastrado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {configured && isAdmin ? (
            <button
              type="button"
              onClick={disconnect}
              disabled={disconnecting}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {disconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Unlink className="h-4 w-4" aria-hidden />
              )}
              Desconectar
            </button>
          ) : null}

          {!configured && isAdmin && canConnect ? (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/emails/oauth/start";
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Link2 className="h-4 w-4" aria-hidden />
              Conectar Gmail
            </button>
          ) : null}

          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Atualizar
          </button>
        </div>
      </div>

      {oauthBanner ? (
        <div
          className={cn(
            "rounded-2xl border p-4 text-sm",
            oauthOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-800"
          )}
        >
          {oauthBanner}
        </div>
      ) : null}

      {!configured ? <SetupPanel canConnect={canConnect} isAdmin={isAdmin} /> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {PROGRAM_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setProgram(tab.value)}
              className={cn(
                "h-9 rounded-xl px-3 text-sm font-semibold transition",
                program === tab.value
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {tab.label}
            </button>
          ))}

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setScope(scope === "unmatched" ? "all" : "unmatched")}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition",
              scope === "unmatched"
                ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
            title="Mostrar somente e-mails que não casaram com nenhum cedente"
          >
            <UserX className="h-4 w-4" aria-hidden />
            Sem cedente
            {summary.unmatched ? ` (${summary.unmatched})` : ""}
          </button>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_1.2fr_auto_auto]">
          <CedenteFilter
            value={cedenteId}
            label={cedenteLabel}
            onChange={(id, label) => {
              setCedenteId(id);
              setCedenteLabel(label);
            }}
          />

          <select
            value={searchIn}
            onChange={(e) => {
              setSearchIn(e.target.value as SearchIn);
              setActiveFilterId(null);
            }}
            className={cn(CONTROL, "w-full lg:w-44")}
            title="Onde buscar"
          >
            <option value="subject">Só no assunto</option>
            <option value="anywhere">No texto do e-mail</option>
          </select>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveFilterId(null);
              }}
              placeholder={
                searchIn === "subject"
                  ? "Código ou texto do título…"
                  : "Palavras ou trecho do e-mail…"
              }
              className={cn(CONTROL, "w-full pl-9")}
            />
          </div>

          <button
            type="button"
            onClick={saveCurrentFilter}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            title="Salvar filtro atual para reutilizar"
          >
            <BookmarkPlus className="h-4 w-4" aria-hidden />
            Salvar
          </button>

          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className={cn(CONTROL, "w-full lg:w-36")}
          >
            {WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-500">Filtros salvos:</span>
          {savedFilters.length === 0 ? (
            <span className="text-xs text-slate-400">
              Nenhum ainda. Busque um código/texto e clique em Salvar.
            </span>
          ) : (
            savedFilters.map((filter) => (
              <span
                key={filter.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ring-1 transition",
                  activeFilterId === filter.id
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200"
                )}
              >
                <button type="button" onClick={() => applySavedFilter(filter)} className="max-w-[180px] truncate">
                  {filter.name}
                  <span className="ml-1 opacity-70">
                    · {filter.searchIn === "subject" ? "assunto" : "texto"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedFilter(filter.id)}
                  className={cn(
                    "rounded p-0.5 transition",
                    activeFilterId === filter.id
                      ? "hover:bg-white/15"
                      : "text-slate-500 hover:bg-slate-300/60 hover:text-slate-800"
                  )}
                  aria-label={`Excluir filtro ${filter.name}`}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))
          )}
          {search.trim() ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActiveFilterId(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar busca
            </button>
          ) : null}
        </div>

        {topCedentes.length > 0 && !cedenteId ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium text-slate-500">Cedentes nesta página:</span>
            {topCedentes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCedenteId(item.id);
                  setCedenteLabel(item.name);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
              >
                {item.name}
                <span className="text-slate-500">{item.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">
              {loading ? "Carregando…" : `${rows.length} e-mail${rows.length === 1 ? "" : "s"}`}
            </div>
            {summary.matched ? (
              <div className="text-xs text-slate-500">{summary.matched} com cedente</div>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Buscando no Gmail…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
              <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
              <div className="text-sm font-medium text-slate-600">Nenhum e-mail encontrado</div>
              <div className="max-w-xs text-xs text-slate-500">
                {configured
                  ? "Ajuste o programa, o cedente ou amplie a janela de datas."
                  : "Configure a integração para começar a ver a caixa de entrada."}
              </div>
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openMessage(row.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition",
                      selectedId === row.id ? "bg-slate-50" : "hover:bg-slate-50/70"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ProgramBadge program={row.program} />
                      {row.cedente ? (
                        <span className="truncate text-xs font-semibold text-sky-700">
                          {row.cedente.nomeCompleto}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-amber-700">Sem cedente</span>
                      )}
                      <span className="ml-auto shrink-0 text-xs text-slate-400">
                        {fmtRelative(row.date)}
                      </span>
                    </div>

                    <div
                      className={cn(
                        "mt-1 truncate text-sm",
                        row.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"
                      )}
                    >
                      {row.subject}
                    </div>

                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{row.snippet}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {nextPageToken && !loading ? (
            <div className="border-t border-slate-100 p-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Carregar mais
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!selectedId ? (
            <div className="flex flex-col items-center gap-2 px-4 py-24 text-center">
              <Mail className="h-8 w-8 text-slate-300" aria-hidden />
              <div className="text-sm font-medium text-slate-600">
                Selecione um e-mail para ler
              </div>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-24 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Abrindo…
            </div>
          ) : detailError ? (
            <div className="p-4 text-sm text-rose-700">{detailError}</div>
          ) : detail ? (
            <div className="flex h-full flex-col">
              <div className="space-y-2 border-b border-slate-100 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ProgramBadge program={detail.program} />
                  {detail.cedente ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                      <User className="h-3 w-3" aria-hidden />
                      {detail.cedente.nomeCompleto} · {detail.cedente.identificador}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                      <UserX className="h-3 w-3" aria-hidden />
                      Sem cedente identificado
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {fmtDateTimeBR(detail.date)}
                  </span>
                </div>

                <div className="text-[15px] font-semibold text-slate-900">{detail.subject}</div>

                <div className="text-xs text-slate-500">
                  De <b className="font-semibold text-slate-700">{detail.fromName || "—"}</b>{" "}
                  &lt;{detail.fromAddress || "—"}&gt;
                  {detail.to ? (
                    <>
                      {" "}
                      · Para <span className="text-slate-700">{detail.to}</span>
                    </>
                  ) : null}
                </div>
              </div>

              <iframe
                title={detail.subject}
                srcDoc={detail.document}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[70vh] w-full rounded-b-2xl border-0"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
