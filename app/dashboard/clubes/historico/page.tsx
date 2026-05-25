"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Gift, History, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/cn";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Status = "ACTIVE" | "PAUSED" | "CANCELED";

type Owner = { id: string; name: string; login: string };

type HistoryRow = {
  id: string;
  program: Program;
  status: Status;
  tierK: number;
  subscribedAt: string;
  renewalDay: number;
  nextRenewalAt: string | null;
  lastRenewedAt: string | null;
  pointsExpireAt: string | null;
  monthlyBonusPoints: number;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    owner: Owner;
  };
};

type ApiResponse = {
  ok: true;
  monthKey: string;
  program: Program | "";
  totals: {
    total: number;
    totalTierK: number;
    totalMonthlyBonusPoints: number;
    byProgram: Record<Program, number>;
  };
  items: HistoryRow[];
};

const PROGRAMS: Array<{ value: "" | Program; label: string }> = [
  { value: "", label: "Todos os programas" },
  { value: "LATAM", label: "LATAM" },
  { value: "SMILES", label: "SMILES" },
  { value: "LIVELO", label: "LIVELO" },
  { value: "ESFERA", label: "ESFERA" },
];

const PROGRAM_PILL: Record<Program, string> = {
  LATAM: "border-red-200 bg-red-50 text-red-700",
  SMILES: "border-orange-200 bg-orange-50 text-orange-700",
  LIVELO: "border-violet-200 bg-violet-50 text-violet-700",
  ESFERA: "border-sky-200 bg-sky-50 text-sky-700",
};

const STATUS_PILL: Record<Status, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
  CANCELED: "border-rose-200 bg-rose-50 text-rose-700",
};

function currentMonthKeyUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelPT(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function maskCpf(cpf: string) {
  const d = String(cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "-";
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function statusLabel(status: Status) {
  if (status === "ACTIVE") return "ATIVO";
  if (status === "PAUSED") return "PAUSADO";
  return "CANCELADO";
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          {icon}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchHistory(monthKey: string, program: "" | Program) {
  const params = new URLSearchParams();
  params.set("monthKey", monthKey);
  if (program) params.set("program", program);

  const res = await fetch(`/api/clubes/historico?${params.toString()}`, {
    cache: "no-store",
    credentials: "include",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Falha ao carregar histórico.");
  }
  return json as ApiResponse;
}

export default function ClubesHistoricoPage() {
  const [monthKey, setMonthKey] = useState(currentMonthKeyUTC);
  const [program, setProgram] = useState<"" | Program>("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(nextMonth = monthKey, nextProgram = program) {
    setLoading(true);
    setError("");
    try {
      const out = await fetchHistory(nextMonth, nextProgram);
      setData(out);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Falha ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = data?.totals;
  const rows = data?.items || [];

  const programBreakdown = useMemo(() => {
    const byProgram = totals?.byProgram || {
      LATAM: 0,
      SMILES: 0,
      LIVELO: 0,
      ESFERA: 0,
    };

    return (["LATAM", "SMILES", "LIVELO", "ESFERA"] as Program[])
      .map((p) => `${p}: ${fmtInt(byProgram[p] || 0)}`)
      .join(" • ");
  }, [totals]);

  return (
    <div className="space-y-6 bg-gradient-to-br from-slate-50/80 via-white to-emerald-50/20 p-6 pb-10">
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-800 p-5 text-white shadow-lg shadow-slate-900/10 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              <History className="h-3.5 w-3.5" aria-hidden />
              Clube
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
              Histórico de assinaturas
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Escolha o programa e o mês para ver quais contas tiveram clube assinado,
              com data de assinatura, renovação e clube contratado.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/dashboard/clubes/cadastrar"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Cadastrar clube
            </Link>
            <Link
              href="/dashboard/clubes"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
            >
              Ver lista
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 md:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_260px_auto] md:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Programa
            </span>
            <select
              value={program}
              onChange={(e) => {
                const next = e.target.value as "" | Program;
                setProgram(next);
                load(monthKey, next);
              }}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/15"
            >
              {PROGRAMS.map((p) => (
                <option key={p.value || "ALL"} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Mês
            </span>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => {
                const next = e.target.value;
                setMonthKey(next);
                if (next) load(next, program);
              }}
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/15"
            />
          </label>

          <button
            type="button"
            onClick={() => load()}
            disabled={loading || !monthKey}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Mostrando assinaturas de {monthLabelPT(data?.monthKey || monthKey)}.
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Assinaturas no mês"
          value={fmtInt(totals?.total || 0)}
          icon={<Users className="h-5 w-5" aria-hidden />}
        />
        <SummaryCard
          title="Total de clubes"
          value={`${fmtInt(totals?.totalTierK || 0)}k`}
          icon={<History className="h-5 w-5" aria-hidden />}
        />
        <SummaryCard
          title="Bônus mensal"
          value={fmtInt(totals?.totalMonthlyBonusPoints || 0)}
          icon={<Gift className="h-5 w-5" aria-hidden />}
        />
        <SummaryCard
          title="Mês selecionado"
          value={monthLabelPT(data?.monthKey || monthKey)}
          icon={<CalendarDays className="h-5 w-5" aria-hidden />}
        />
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-white px-4 py-3 md:px-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Lista de assinaturas</h2>
            <p className="text-xs text-slate-500">{programBreakdown}</p>
          </div>
          <div className="text-xs font-medium text-slate-500">
            Registros: {fmtInt(rows.length)}
          </div>
        </div>

        <div className="overflow-x-auto p-2 md:p-3">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5">Cedente</th>
                <th className="px-3 py-2.5">Programa</th>
                <th className="px-3 py-2.5">Clube</th>
                <th className="px-3 py-2.5">Assinado em</th>
                <th className="px-3 py-2.5">Renovação</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Responsável</th>
                <th className="px-3 py-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-50 transition hover:bg-slate-50/80 last:border-b-0"
                >
                  <td className="px-3 py-3.5">
                    <div className="font-semibold text-slate-900">
                      {row.cedente.nomeCompleto}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.cedente.identificador} • CPF {maskCpf(row.cedente.cpf)}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                        PROGRAM_PILL[row.program]
                      )}
                    >
                      {row.program}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="font-semibold text-slate-900">Clube {row.tierK}k</div>
                    <div className="text-xs text-slate-500">
                      Bônus/mês: {fmtInt(row.monthlyBonusPoints)}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 font-medium text-slate-900">
                    {fmtDateBR(row.subscribedAt)}
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="font-medium text-slate-900">
                      {fmtDateBR(row.nextRenewalAt)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Dia {row.renewalDay}
                      {row.lastRenewedAt
                        ? ` • última: ${fmtDateBR(row.lastRenewedAt)}`
                        : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold",
                        STATUS_PILL[row.status]
                      )}
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    <div className="font-medium text-slate-800">{row.cedente.owner.name}</div>
                    <div className="text-xs text-slate-500">@{row.cedente.owner.login}</div>
                  </td>
                  <td className="px-3 py-3.5 text-right">
                    <Link
                      href={`/dashboard/clubes/cadastrar?cedenteId=${encodeURIComponent(
                        row.cedente.id
                      )}&program=${row.program}`}
                      className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Ver clube
                    </Link>
                  </td>
                </tr>
              ))}

              {!rows.length && !loading ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={8}>
                    Nenhuma assinatura encontrada para este programa e mês.
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={8}>
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                      Carregando histórico...
                    </span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
