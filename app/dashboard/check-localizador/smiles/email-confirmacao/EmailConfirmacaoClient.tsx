"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  EyeOff,
  ListChecks,
  Mail,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  calendarDaysUntil,
  formatCalendarDateBR,
  formatCalendarDayMonthPT,
  formatCalendarFullDatePT,
  formatInstantDateBR,
} from "@/lib/dates/brazilCalendar";

const DESTINO = "confirme@voegol.com.br";

type UserLite = { id: string; name: string; login: string };

type Row = {
  id: string;
  numero: string;
  date: string | null;
  locator: string | null;
  passengers: number;
  firstPassengerLastName: string | null;
  departureAirportIata: string | null;
  departureDate: string | null;
  returnDate: string | null;
  smilesLocatorManualStatus: string | null;
  sentAt: string | null;
  sentBy: UserLite | null;
  passengerNames: string;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    email: string | null;
    senhaEmail: string | null;
    createdAt: string | null;
  };
};

type ApiResp = {
  ok: true;
  rows: Row[];
  summary: { total: number; sent: number; pending: number };
};

type Filter = "PENDING" | "SENT" | "ALL";

const CONTROL =
  "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

function fmtDateBR(iso: string | null | undefined) {
  return formatCalendarDateBR(iso);
}

/** "19 de julho" — usado no corpo da mensagem. */
function fmtDayMonthPT(iso: string | null | undefined) {
  return formatCalendarDayMonthPT(iso);
}

/** "23 de julho de 2026" — usado no corpo da mensagem. */
function fmtFullDatePT(iso: string | null | undefined) {
  return formatCalendarFullDatePT(iso);
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function daysUntil(iso: string | null | undefined) {
  return calendarDaysUntil(iso);
}

function buildMessage(row: Row, passengerNames: string) {
  const nomes = passengerNames.trim() || "[nomes dos passageiros]";

  return [
    "CONFIRMAÇÃO DE VOO",
    "",
    "Boa tarde,",
    "Gostaria de confirmar a emissão de um bilhete para os seguintes passageiros:",
    "",
    nomes,
    "",
    `A emissão foi realizada na data de ${fmtDayMonthPT(
      row.date
    )} e o voo ocorrerá dia ${fmtFullDatePT(row.departureDate)}.`,
    "",
    "O resgate foi realizado por mim, em minha conta da Smiles.",
    "",
    `Nome titular: ${row.cedente.nomeCompleto}`,
    `CPF: ${maskCpf(row.cedente.cpf)}`,
  ].join("\n");
}

function SummaryCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: number;
  tone: "slate" | "emerald" | "amber";
  icon: React.ReactNode;
}) {
  const grad =
    tone === "emerald"
      ? "from-emerald-500 to-teal-600"
      : tone === "amber"
      ? "from-amber-500 to-orange-600"
      : "from-slate-500 to-slate-600";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div
        className={cn(
          "pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl",
          grad
        )}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            grad
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900">
            {value.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>
    </div>
  );
}

function CredField({
  label,
  value,
  secret,
  onCopy,
}: {
  label: string;
  value: string | null;
  secret?: boolean;
  onCopy: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const has = Boolean((value || "").trim());
  const display = !has ? "—" : secret && !show ? "••••••••" : value;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </div>
        <div className="flex items-center gap-2">
          {secret && has ? (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="text-slate-500 hover:text-slate-800"
              title={show ? "Ocultar" : "Mostrar"}
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!has}
            onClick={() => onCopy(value || "")}
            className={cn(
              "rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium",
              has ? "hover:bg-slate-50" : "cursor-not-allowed opacity-40"
            )}
          >
            Copiar
          </button>
        </div>
      </div>
      <div className="mt-1 break-all font-mono text-sm text-slate-800">{display}</div>
    </div>
  );
}

function RowItem({
  row,
  expanded,
  onToggle,
  onSaveNames,
  onToggleSent,
  savingId,
  onCopy,
}: {
  row: Row;
  expanded: boolean;
  onToggle: () => void;
  onSaveNames: (id: string, names: string) => Promise<void>;
  onToggleSent: (id: string, sent: boolean) => Promise<void>;
  savingId: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  const [names, setNames] = useState(row.passengerNames || "");

  useEffect(() => {
    setNames(row.passengerNames || "");
  }, [row.passengerNames]);

  const message = useMemo(() => buildMessage(row, names), [row, names]);
  const dirty = (names || "").trim() !== (row.passengerNames || "").trim();
  const busy = savingId === row.id;
  const dias = daysUntil(row.departureDate);
  const sent = Boolean(row.sentAt);

  return (
    <li className={cn(sent && !expanded && "bg-emerald-50/40")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 md:px-5",
          expanded && "bg-slate-50"
        )}
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            expanded && "rotate-180"
          )}
          aria-hidden
        />

        <span className="w-[84px] shrink-0 font-mono text-sm font-bold text-slate-900">
          {row.locator || "—"}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {row.cedente.nomeCompleto}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {row.cedente.identificador} • Ida {fmtDateBR(row.departureDate)} •{" "}
            {row.passengers} pax
          </span>
        </span>

        {dias != null ? (
          <span
            className={cn(
              "hidden shrink-0 rounded-full border px-2 py-1 text-xs font-medium sm:inline-block",
              dias <= 2
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : dias <= 7
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-slate-200 bg-white text-slate-600"
            )}
          >
            {dias === 0 ? "Voo hoje" : dias === 1 ? "Voo amanhã" : `Em ${dias} dias`}
          </span>
        ) : null}

        {sent ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Enviado
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            Pendente
          </span>
        )}
      </button>

      {!expanded ? null : (
        <div className="grid gap-4 border-t border-slate-100 px-4 py-4 md:px-5 lg:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 lg:col-span-2">
            <span>Emissão: {fmtDateBR(row.date)}</span>
            <span>•</span>
            <span>
              Ida: {fmtDateBR(row.departureDate)}
              {row.departureAirportIata ? ` (${row.departureAirportIata})` : ""}
            </span>
            <span>•</span>
            <span>Volta: {fmtDateBR(row.returnDate)}</span>
            <span>•</span>
            <span>
              {row.passengers} {row.passengers === 1 ? "passageiro" : "passageiros"}
            </span>
            {sent ? (
              <>
                <span>•</span>
                <span className="font-semibold text-emerald-700">
                  Enviado {formatInstantDateBR(row.sentAt)}
                  {row.sentBy ? ` por @${row.sentBy.login}` : ""}
                </span>
              </>
            ) : null}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Enviar do e-mail do cedente
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Faça login no e-mail abaixo e envie a mensagem para{" "}
                <span className="font-mono font-semibold text-slate-700">{DESTINO}</span>.
              </p>
            </div>

            <div className="grid gap-2">
              <CredField
                label="Login do e-mail"
                value={row.cedente.email}
                onCopy={(v) => onCopy("Login do e-mail", v)}
              />
              <CredField
                label="Senha do e-mail"
                value={row.cedente.senhaEmail}
                secret
                onCopy={(v) => onCopy("Senha do e-mail", v)}
              />
              <CredField
                label="CPF do titular"
                value={maskCpf(row.cedente.cpf)}
                onCopy={(v) => onCopy("CPF", v)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nomes dos passageiros
              </label>
              <textarea
                rows={3}
                value={names}
                onChange={(e) => setNames(e.target.value)}
                placeholder={"Um nome por linha"}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!dirty || busy}
                  onClick={() => onSaveNames(row.id, names)}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs font-semibold shadow-sm",
                    dirty && !busy
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "cursor-not-allowed bg-slate-200 text-slate-500"
                  )}
                >
                  {busy ? "Salvando…" : "Salvar nomes"}
                </button>
                {row.firstPassengerLastName ? (
                  <span className="text-[11px] text-slate-500">
                    Sobrenome no cadastro: <b>{row.firstPassengerLastName}</b>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Mensagem de confirmação
              </div>
              <button
                type="button"
                onClick={() => onCopy("Mensagem", message)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copiar mensagem
              </button>
            </div>

            <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-[12px] leading-relaxed text-slate-700">
              {message}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {sent ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggleSent(row.id, false)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                  Desmarcar envio
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggleSent(row.id, true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Marcar como enviado
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

export default function EmailConfirmacaoClient() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/check-localizador/smiles/email-confirmacao", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar a lista.");
      }
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Falha ao carregar a lista.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copyValue(label: string, value: string) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt(`Copie manualmente (${label}):`, text);
    }
  }

  function patchRow(id: string, patch: Partial<Row>) {
    setData((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
      const summary = rows.reduce(
        (acc, r) => {
          acc.total += 1;
          if (r.sentAt) acc.sent += 1;
          else acc.pending += 1;
          return acc;
        },
        { total: 0, sent: 0, pending: 0 }
      );
      return { ...prev, rows, summary };
    });
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/check-localizador/smiles/email-confirmacao", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Falha ao salvar.");
    }
    return json.row as { id: string; sentAt: string | null; sentBy: UserLite | null; passengerNames: string };
  }

  async function saveNames(id: string, names: string) {
    setSavingId(id);
    try {
      const row = await post({ saleId: id, passengerNames: names });
      patchRow(id, { passengerNames: row.passengerNames });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao salvar os nomes.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleSent(id: string, sent: boolean) {
    setSavingId(id);
    try {
      const row = await post({ saleId: id, sent });
      patchRow(id, { sentAt: row.sentAt, sentBy: row.sentBy });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Falha ao atualizar o envio.");
    } finally {
      setSavingId(null);
    }
  }

  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    const needle = q
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    return rows.filter((r) => {
      if (filter === "PENDING" && r.sentAt) return false;
      if (filter === "SENT" && !r.sentAt) return false;
      if (!needle) return true;

      const hay = [
        r.locator,
        r.cedente.nomeCompleto,
        r.cedente.identificador,
        r.cedente.cpf,
        r.cedente.email,
      ]
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      return hay.includes(needle);
    });
  }, [data, filter, q]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-500">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
        <p className="text-sm font-medium">Carregando lista…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-orange-950 to-slate-800 p-5 text-white shadow-lg shadow-slate-900/10 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-100">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Check Localizador · Smiles
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
              Email de confirmação
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Emissões Smiles com voo ainda por acontecer, sem status de derrubado e de
              cedentes cadastrados nos últimos 90 dias. A mensagem deve ser enviada do
              e-mail do próprio titular para{" "}
              <span className="font-mono font-semibold text-white">{DESTINO}</span>.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          title="Total na lista"
          value={data?.summary.total || 0}
          tone="slate"
          icon={<ListChecks className="h-5 w-5" aria-hidden />}
        />
        <SummaryCard
          title="Pendentes"
          value={data?.summary.pending || 0}
          tone="amber"
          icon={<Clock className="h-5 w-5" aria-hidden />}
        />
        <SummaryCard
          title="Enviados"
          value={data?.summary.sent || 0}
          tone="emerald"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
        />
      </div>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["PENDING", "Pendentes"],
                ["SENT", "Enviados"],
                ["ALL", "Todos"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                  filter === value
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por localizador, cedente, CPF ou e-mail…"
            className={cn(CONTROL, "w-full sm:w-80")}
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {visibleRows.length ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <ul className="divide-y divide-slate-100">
            {visibleRows.map((row) => (
              <RowItem
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === row.id ? null : row.id))
                }
                onSaveNames={saveNames}
                onToggleSent={toggleSent}
                savingId={savingId}
                onCopy={copyValue}
              />
            ))}
          </ul>
        </section>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          Nenhuma emissão nesta visão.
        </div>
      )}
    </div>
  );
}
