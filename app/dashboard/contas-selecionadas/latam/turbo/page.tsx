"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";

type TurboStatus = "PENDING" | "TRANSFERRED" | "SKIPPED";
type ClubStatus = "ACTIVE" | "PAUSED" | "CANCELED";

type Row = {
  cedente: { id: string; identificador: string; nomeCompleto: string; cpf: string };

  club: null | {
    id: string;
    status: ClubStatus;
    tierK: number;
    subscribedAt: string;
    renewalDay: number;
    lastRenewedAt: string | null;
    pointsExpireAt: string | null;
  };

  auto: null | {
    nextRenewalAt: string;
    inactiveAt: string;
    cancelAt: string;
    inactiveInMonth: boolean;
    cancelInMonth: boolean;
  };

  account: { cpfLimit: number; cpfUsed: number; cpfFree: number };

  turbo: null | {
    id: string;
    status: TurboStatus;
    points: number;
    notes: string | null;
    updatedAt: string;
  };

  buckets: {
    isActiveBucket: boolean;
    isInactiveBucket: boolean;
    isCancelBucket: boolean;
    canceledInMonth: boolean;
    canSubscribe: boolean;
  };
};

type ApiResp = {
  ok: true;
  monthKey: string;
  limitPoints: number;
  usedPoints: number;
  remainingPoints: number;
  lists: {
    active: Row[];
    inactive: Row[];
    cancelThisMonth: Row[];
    canceledInMonth: Row[];
    canSubscribe: Row[];
  };
};

type StatusCounts = {
  total: number;
  pending: number;
  transferred: number;
  skipped: number;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function dateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function monthLabel(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  return d.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonthKey(key: string, delta: number) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rowStatus(r: Row): TurboStatus {
  return r.turbo?.status || "PENDING";
}

function countStatuses(rows: Row[]): StatusCounts {
  let pending = 0;
  let transferred = 0;
  let skipped = 0;
  for (const r of rows) {
    const s = rowStatus(r);
    if (s === "TRANSFERRED") transferred += 1;
    else if (s === "SKIPPED") skipped += 1;
    else pending += 1;
  }
  return { total: rows.length, pending, transferred, skipped };
}

function pillClass(s: TurboStatus) {
  if (s === "TRANSFERRED")
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "SKIPPED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function clubLabel(s: ClubStatus | undefined) {
  if (s === "ACTIVE") return "Ativo";
  if (s === "PAUSED") return "Pausado";
  if (s === "CANCELED") return "Cancelado";
  return "—";
}

/**
 * PRIORIDADE (para aparecer em cima):
 *  0) inativa no mês + em aguardo
 *  1) em aguardo
 *  2) resto
 *  Empate: ordem alfabética
 */
function rowPriority(r: Row) {
  const st = rowStatus(r);
  if (st !== "PENDING") return 2;
  if (r.auto?.inactiveInMonth) return 0;
  return 1;
}
function rowAlphaKey(r: Row) {
  return (r.cedente.nomeCompleto || r.cedente.identificador || "").trim();
}
function compareRowsByPriority(a: Row, b: Row) {
  const pa = rowPriority(a);
  const pb = rowPriority(b);
  if (pa !== pb) return pa - pb;
  return rowAlphaKey(a).localeCompare(rowAlphaKey(b), "pt-BR", {
    sensitivity: "base",
  });
}

async function postTurbo(payload: any) {
  const r = await fetch("/api/latam/turbo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Falha ao salvar turbo");
  return j.item;
}

async function postAccount(payload: any) {
  const r = await fetch("/api/latam/turbo/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok || !j?.ok) throw new Error(j?.error || "Falha ao salvar CPFs");
  return j.item;
}

function StatusStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "rose";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "rose"
        ? "text-rose-700"
        : "text-amber-700";
  const dot =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "rose"
        ? "bg-rose-500"
        : "bg-amber-400";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn("shrink-0 text-sm font-bold tabular-nums", cls)}>
        {fmtInt(value)}
      </span>
    </div>
  );
}

function GroupSummaryCard({
  id,
  title,
  hint,
  counts,
  showStatus,
  accent,
}: {
  id: string;
  title: string;
  hint: string;
  counts: StatusCounts;
  showStatus: boolean;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      className="relative z-0 h-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
            {fmtInt(counts.total)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
        </div>
        <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", accent)} />
      </div>
      {showStatus ? (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          <StatusStat label="Aguardando" value={counts.pending} tone="amber" />
          <StatusStat label="Transferidos" value={counts.transferred} tone="emerald" />
          <StatusStat label="Negados" value={counts.skipped} tone="rose" />
        </div>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Sem marcação turbo — só elegibilidade de clube.
        </div>
      )}
    </button>
  );
}

function Section({
  id,
  title,
  hint,
  rows,
  monthKey,
  onChange,
  showClub = true,
  showCancelBadge = false,
  showCanceledDoneBadge = false,
}: {
  id: string;
  title: string;
  hint?: string;
  rows: Row[];
  monthKey: string;
  onChange: (cedenteId: string, patch: Partial<{ status: TurboStatus; points: number }>) => void;
  showClub?: boolean;
  showCancelBadge?: boolean;
  showCanceledDoneBadge?: boolean;
}) {
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort(compareRowsByPriority);
    return copy;
  }, [rows]);
  const counts = useMemo(() => countStatuses(sortedRows), [sortedRows]);

  return (
    <section
      id={id}
      className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold tabular-nums text-slate-700">
            {fmtInt(counts.total)} contas
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold tabular-nums text-amber-800">
            {fmtInt(counts.pending)} aguardando
          </span>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold tabular-nums text-emerald-800">
            {fmtInt(counts.transferred)} transferidos
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold tabular-nums text-rose-800">
            {fmtInt(counts.skipped)} negados
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Identificador</th>
              <th className="px-3 py-3">Nome</th>
              <th className="px-3 py-3">CPF</th>
              {showClub ? (
                <>
                  <th className="px-3 py-3">Clube LATAM</th>
                  <th className="px-3 py-3">Inativa em</th>
                  <th className="px-3 py-3">Cancela em</th>
                </>
              ) : null}
              <th className="px-3 py-3">CPFs livres</th>
              <th className="px-3 py-3">Pontos (mês)</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3 pr-4">Marcar</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const status: TurboStatus = r.turbo?.status || "PENDING";
              const points = r.turbo?.points || 0;

              return (
                <tr
                  key={r.cedente.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {r.cedente.identificador}
                  </td>
                  <td className="px-3 py-3 text-slate-800">{r.cedente.nomeCompleto}</td>
                  <td className="px-3 py-3 tabular-nums text-slate-600">{r.cedente.cpf}</td>

                  {showClub ? (
                    <>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700">
                            {clubLabel(r.club?.status)}
                          </span>
                          {showCancelBadge && r.auto?.cancelInMonth ? (
                            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                              cancela no mês
                            </span>
                          ) : null}
                          {showCanceledDoneBadge ? (
                            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-800">
                              cancelada no mês
                            </span>
                          ) : null}
                          {!showCancelBadge &&
                          !showCanceledDoneBadge &&
                          r.auto?.inactiveInMonth ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                              inativa no mês
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-600">
                        {dateBR(r.auto?.inactiveAt)}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-600">
                        {dateBR(r.auto?.cancelAt)}
                      </td>
                    </>
                  ) : null}

                  <td className="px-3 py-3">
                    <span className="inline-flex min-w-7 justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-800">
                      {r.account.cpfFree}
                    </span>
                  </td>

                  <td className="px-3 py-3">
                    <input
                      className="h-9 w-32 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                      value={String(points)}
                      inputMode="numeric"
                      onChange={(e) => {
                        const v = Math.max(
                          0,
                          Math.trunc(Number(e.target.value || 0) || 0)
                        );
                        onChange(r.cedente.id, { points: v });
                      }}
                    />
                    <div className="mt-1 text-[11px] text-slate-400">ref: {monthKey}</div>
                  </td>

                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                        pillClass(status)
                      )}
                    >
                      {status === "TRANSFERRED"
                        ? "transferido"
                        : status === "SKIPPED"
                          ? "negado"
                          : "aguardando"}
                    </span>
                  </td>

                  <td className="px-3 py-3 pr-4">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                          status === "PENDING"
                            ? "bg-amber-500 text-white shadow-sm"
                            : "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        )}
                        onClick={() => onChange(r.cedente.id, { status: "PENDING" })}
                      >
                        <Clock3 className="h-3 w-3" aria-hidden />
                        Aguardo
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                          status === "TRANSFERRED"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        )}
                        onClick={() =>
                          onChange(r.cedente.id, { status: "TRANSFERRED" })
                        }
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Verde
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                          status === "SKIPPED"
                            ? "bg-rose-600 text-white shadow-sm"
                            : "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                        )}
                        onClick={() => onChange(r.cedente.id, { status: "SKIPPED" })}
                      >
                        <XCircle className="h-3 w-3" aria-hidden />
                        Vermelho
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-sm text-slate-500">
                  Nenhuma conta neste grupo neste mês.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function LatamTurboPage() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyRelevant, setOnlyRelevant] = useState(true);
  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (onlyRelevant) params.set("onlyRelevant", "1");
      params.set("monthKey", monthKey);

      const r = await fetch(`/api/latam/turbo?${params.toString()}`);
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error || "Falha ao carregar");
      setData(j);
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyRelevant, monthKey]);

  const displayMonth = data?.monthKey || monthKey || "—";

  const groupStats = useMemo(() => {
    if (!data) return null;
    return {
      active: countStatuses(data.lists.active),
      inactive: countStatuses(data.lists.inactive),
      cancelThisMonth: countStatuses(data.lists.cancelThisMonth),
      canceledInMonth: countStatuses(data.lists.canceledInMonth),
      canSubscribe: countStatuses(data.lists.canSubscribe),
    };
  }, [data]);

  const monthTotals = useMemo(() => {
    if (!groupStats) return null;
    const parts = [
      groupStats.active,
      groupStats.inactive,
      groupStats.cancelThisMonth,
      groupStats.canceledInMonth,
    ];
    return parts.reduce(
      (acc, c) => ({
        total: acc.total + c.total,
        pending: acc.pending + c.pending,
        transferred: acc.transferred + c.transferred,
        skipped: acc.skipped + c.skipped,
      }),
      { total: 0, pending: 0, transferred: 0, skipped: 0 }
    );
  }, [groupStats]);

  async function applyChange(
    cedenteId: string,
    patch: Partial<{ status: TurboStatus; points: number }>
  ) {
    if (!data) return;

    const mutateLists = (rows: Row[]) =>
      rows.map((r) => {
        if (r.cedente.id !== cedenteId) return r;
        const cur =
          r.turbo || {
            id: "",
            status: "PENDING" as TurboStatus,
            points: 0,
            notes: null,
            updatedAt: new Date().toISOString(),
          };
        const next = {
          ...cur,
          status: (patch.status ?? cur.status) as TurboStatus,
          points: typeof patch.points === "number" ? patch.points : cur.points,
          updatedAt: new Date().toISOString(),
        };
        return { ...r, turbo: next };
      });

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lists: {
          active: mutateLists(prev.lists.active),
          inactive: mutateLists(prev.lists.inactive),
          cancelThisMonth: mutateLists(prev.lists.cancelThisMonth),
          canceledInMonth: mutateLists(prev.lists.canceledInMonth),
          canSubscribe: mutateLists(prev.lists.canSubscribe),
        },
      };
    });

    try {
      await postTurbo({
        cedenteId,
        monthKey: displayMonth,
        ...(patch.status ? { status: patch.status } : {}),
        ...(typeof patch.points === "number" ? { points: patch.points } : {}),
      });

      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar");
      await load();
    }
  }

  async function saveCpf(cedenteId: string, cpfLimit: number, cpfUsed: number) {
    try {
      await postAccount({ cedenteId, cpfLimit, cpfUsed });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao salvar CPFs");
    }
  }

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Carregando LATAM Turbo…
        </div>
      </div>
    );
  }
  if (err && !data) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {err}
        </div>
      </div>
    );
  }
  if (!data || !groupStats || !monthTotals) return null;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            LATAM Turbo
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Contagens do mês e marcação de transferência por grupo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              className="px-2.5 py-2 text-slate-600 hover:text-slate-900"
              onClick={() => setMonthKey(shiftMonthKey(displayMonth, -1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-[9.5rem] px-1 text-center text-sm font-semibold capitalize text-slate-800">
              {monthLabel(displayMonth)}
            </div>
            <button
              type="button"
              className="px-2.5 py-2 text-slate-600 hover:text-slate-900"
              onClick={() => setMonthKey(shiftMonthKey(displayMonth, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10 sm:w-72"
              placeholder="Buscar nome, identificador ou CPF"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
            />
          </div>
          <button
            type="button"
            className="h-10 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={load}
          >
            Buscar
          </button>
          <label className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyRelevant}
              onChange={(e) => setOnlyRelevant(e.target.checked)}
            />
            Só relevantes
          </label>
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      ) : null}

      <div className="relative z-0 mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <GroupSummaryCard
          id="turbo-ativos"
          title="No mês"
          hint="Ativos + inativos + cancelamentos"
          counts={monthTotals}
          showStatus
          accent="bg-teal-500"
        />
        <GroupSummaryCard
          id="turbo-ativos"
          title="Ativos"
          hint="Clube ativo (inclui inativa no mês)"
          counts={groupStats.active}
          showStatus
          accent="bg-sky-500"
        />
        <GroupSummaryCard
          id="turbo-inativos"
          title="Inativos"
          hint="Clube pausado"
          counts={groupStats.inactive}
          showStatus
          accent="bg-slate-400"
        />
        <GroupSummaryCard
          id="turbo-cancelam"
          title="Cancelam no mês"
          hint="Ainda vão cancelar"
          counts={groupStats.cancelThisMonth}
          showStatus
          accent="bg-orange-500"
        />
        <GroupSummaryCard
          id="turbo-canceladas"
          title="Canceladas no mês"
          hint="Já canceladas"
          counts={groupStats.canceledInMonth}
          showStatus
          accent="bg-rose-500"
        />
        <GroupSummaryCard
          id="turbo-assinar"
          title="Podem assinar"
          hint="CPFs livres acima de 5"
          counts={groupStats.canSubscribe}
          showStatus={false}
          accent="bg-violet-500"
        />
      </div>

      <div className="grid gap-5">
        <Section
          id="turbo-ativos"
          title="Ativos"
          hint="Inclui “inativa no mês” se não cancelar no mês."
          rows={data.lists.active}
          monthKey={displayMonth}
          onChange={applyChange}
          showCancelBadge={false}
        />

        <Section
          id="turbo-inativos"
          title="Inativos (pausados)"
          rows={data.lists.inactive}
          monthKey={displayMonth}
          onChange={applyChange}
          showCancelBadge={false}
        />

        <Section
          id="turbo-cancelam"
          title="Cancelam no mês"
          rows={data.lists.cancelThisMonth}
          monthKey={displayMonth}
          onChange={applyChange}
          showCancelBadge={true}
        />

        <div className="grid gap-2">
          <Section
            id="turbo-canceladas"
            title="Canceladas no mês"
            rows={data.lists.canceledInMonth}
            monthKey={displayMonth}
            onChange={applyChange}
            showCancelBadge={false}
            showCanceledDoneBadge={true}
          />
          <p className="px-1 text-xs leading-relaxed text-slate-500">
            Clube já como cancelado e data de cancelamento dentro do mês exibido — ou
            ajuste manual registrado no mês quando não há data de expiração.
          </p>
        </div>

        <section
          id="turbo-assinar"
          className="scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40"
        >
          <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Podem assinar clube
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                Cancelado ou sem assinatura, com mais de 5 CPFs livres.
              </div>
            </div>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-violet-800">
              {fmtInt(data.lists.canSubscribe.length)} contas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Identificador</th>
                  <th className="px-3 py-3">Nome</th>
                  <th className="px-3 py-3">CPF</th>
                  <th className="px-3 py-3">CPFs livres</th>
                  <th className="px-3 py-3">Limite</th>
                  <th className="px-3 py-3">Usados</th>
                  <th className="px-3 py-3 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {data.lists.canSubscribe.map((r) => (
                  <tr
                    key={r.cedente.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {r.cedente.identificador}
                    </td>
                    <td className="px-3 py-3 text-slate-800">{r.cedente.nomeCompleto}</td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">
                      {r.cedente.cpf}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex min-w-7 justify-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-violet-800">
                        {r.account.cpfFree}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                        defaultValue={String(r.account.cpfLimit)}
                        onBlur={(e) => {
                          const v = Math.max(
                            0,
                            Math.trunc(Number(e.target.value || 0) || 0)
                          );
                          saveCpf(r.cedente.id, v, r.account.cpfUsed);
                        }}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <input
                        className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm tabular-nums outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                        defaultValue={String(r.account.cpfUsed)}
                        onBlur={(e) => {
                          const v = Math.max(
                            0,
                            Math.trunc(Number(e.target.value || 0) || 0)
                          );
                          saveCpf(r.cedente.id, r.account.cpfLimit, v);
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 pr-4 text-xs text-slate-400">
                      edite e clique fora
                    </td>
                  </tr>
                ))}

                {data.lists.canSubscribe.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm text-slate-500"
                    >
                      Nenhuma conta elegível (mais de 5 CPFs livres).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
