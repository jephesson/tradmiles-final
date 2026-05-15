"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Infinity as InfinityIcon,
  Loader2,
  PieChart,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";

type UserLite = { id: string; name: string; login: string; role: string };

type Row = {
  owner: UserLite;
  cedentesCount: number;
  items: Array<{
    payeeId: string;
    bps: number;
    payee: { id: string; name: string; login: string };
  }>;
  sumBps: number;
  isDefault: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

function fmtPct(bps: number) {
  const v = (Number(bps || 0) / 100).toFixed(2).replace(".", ",");
  return `${v}%`;
}

function n(v: unknown, fb = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fb;
}

function pad2(x: number) {
  return String(x).padStart(2, "0");
}

function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysISODate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtDateBR(isoOrDate?: string | null) {
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const body = data as { ok?: boolean; error?: string };
  if (!res.ok || body?.ok === false) throw new Error(body?.error || `Erro ${res.status}`);
  return data as T;
}

type EditItem = { payeeId: string; percent: number };

const ACCENT_STRIPES = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function stripeClass(i: number) {
  return ACCENT_STRIPES[i % ACCENT_STRIPES.length];
}

function RoleBadge({ role }: { role: string }) {
  const r = String(role || "").toLowerCase();
  const isAdmin = r === "admin";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
        isAdmin
          ? "bg-violet-50 text-violet-800 ring-violet-200/80"
          : "bg-slate-100 text-slate-600 ring-slate-200/80"
      )}
    >
      {isAdmin ? "Admin" : "Equipe"}
    </span>
  );
}

function RateioBreakdown({ row }: { row: Row }) {
  const items = row.items?.length ? row.items : null;
  if (!items) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <span className="inline-flex min-w-[3.25rem] justify-end rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700 ring-1 ring-slate-200/80 tabular-nums">
          100%
        </span>
        <span className="text-xs">Todo o lucro fica com o próprio owner</span>
      </div>
    );
  }

  return (
    <ul className="flex max-w-md flex-col gap-2">
      {items.map((it, i) => (
        <li key={`${it.payeeId}-${i}`} className="flex items-stretch gap-2">
          <span className={cn("w-1 shrink-0 rounded-full", stripeClass(i))} aria-hidden />
          <div className="min-w-0 flex-1 rounded-lg bg-slate-50/90 px-2.5 py-1.5 ring-1 ring-slate-200/60">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-mono text-xs font-bold tabular-nums text-emerald-800">{fmtPct(it.bps)}</span>
              <span className="min-w-0 text-xs font-medium leading-snug text-slate-800">
                {it.payee?.name || it.payeeId}
              </span>
            </div>
            {it.payee?.login ? (
              <div className="mt-0.5 font-mono text-[10px] text-slate-500">{it.payee.login}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: "slate" | "emerald" | "amber";
}) {
  const tones = {
    slate: "from-slate-50 to-white ring-slate-200/70 text-slate-600",
    emerald: "from-emerald-50/80 to-white ring-emerald-200/60 text-emerald-700",
    amber: "from-amber-50/70 to-white ring-amber-200/60 text-amber-800",
  };
  const iconTones = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200/80",
    emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200/70",
    amber: "bg-amber-100 text-amber-700 ring-amber-200/70",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 shadow-sm ring-1 ring-inset",
        tones[tone]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</div>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            iconTones[tone]
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        </div>
      </div>
    </div>
  );
}

export default function RateioClient() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [effectiveFrom, setEffectiveFrom] = useState<string>(addDaysISODate(1));
  const minEffectiveFrom = todayISODate();

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr(null);
    try {
      const out = await api<{ ok: true; users: UserLite[]; rows: Row[] }>("/api/funcionarios/rateio");
      setUsers(out.users || []);
      setRows(out.rows || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao carregar.");
      setUsers([]);
      setRows([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = [r.owner.name, r.owner.login, r.owner.role, String(r.cedentesCount)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const configured = filtered.filter((r) => !r.isDefault).length;
    const missing = total - configured;
    return { total, configured, missing };
  }, [filtered]);

  function openEdit(r: Row) {
    setEditingOwnerId(r.owner.id);

    const items = (r.items || []).map((it) => ({
      payeeId: it.payeeId,
      percent: Math.round((n(it.bps) / 100) * 100) / 100,
    }));

    if (!items.length) items.push({ payeeId: r.owner.id, percent: 100 });
    setEditItems(items);

    const ef = r.effectiveFrom ? new Date(r.effectiveFrom) : null;
    const now = new Date();
    if (ef && !Number.isNaN(ef.getTime()) && ef.getTime() > now.getTime()) {
      setEffectiveFrom(`${ef.getFullYear()}-${pad2(ef.getMonth() + 1)}-${pad2(ef.getDate())}`);
    } else {
      setEffectiveFrom(addDaysISODate(1));
    }
  }

  function closeEdit() {
    setEditingOwnerId(null);
    setEditItems([]);
    setSaving(false);
    setEffectiveFrom(addDaysISODate(1));
  }

  const sumPercent = useMemo(() => {
    const s = editItems.reduce((acc, it) => acc + n(it.percent), 0);
    return Math.round(s * 100) / 100;
  }, [editItems]);

  const hasEmptyPayee = useMemo(() => editItems.some((it) => !String(it.payeeId || "").trim()), [editItems]);

  const canSave =
    Boolean(editingOwnerId) &&
    editItems.length > 0 &&
    !hasEmptyPayee &&
    Math.abs(sumPercent - 100) < 0.001 &&
    Boolean(effectiveFrom) &&
    effectiveFrom >= minEffectiveFrom;

  async function saveEdit() {
    if (!editingOwnerId) return;

    if (!effectiveFrom || effectiveFrom < minEffectiveFrom) {
      alert("Escolha uma data válida (não pode ser no passado).");
      return;
    }
    if (hasEmptyPayee) {
      alert("Existe destinatário vazio. Selecione todos os destinatários.");
      return;
    }
    if (Math.abs(sumPercent - 100) >= 0.001) {
      alert("O rateio precisa somar 100%.");
      return;
    }

    setSaving(true);
    setErr(null);

    try {
      await api<{ ok: true }>("/api/funcionarios/rateio", {
        method: "PUT",
        body: JSON.stringify({
          ownerId: editingOwnerId,
          effectiveFrom,
          items: editItems.map((it) => ({ payeeId: it.payeeId, percent: it.percent })),
        }),
      });

      await load({ silent: true });
      closeEdit();
      alert("Rateio salvo.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar rateio.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-800 ring-1 ring-sky-200/80">
            <PieChart className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Lucro por owner
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">
            Rateio do lucro{" "}
            <span className="font-semibold text-slate-500">(base percentual)</span>
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Defina como o lucro líquido é dividido por <strong className="font-semibold text-slate-800">grupo do dono do cedente</strong>{" "}
            (owner).
          </p>
          <div className="flex items-start gap-2 rounded-xl bg-emerald-50/80 px-3 py-2.5 text-xs leading-relaxed text-emerald-900 ring-1 ring-emerald-200/70">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
            <span>
              Alterações não reescrevem o passado: use uma <strong>data de vigência</strong> e o novo rateio passa a valer
              só a partir dela.
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={2} aria-hidden />
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Users} label="Funcionários listados" value={totals.total} tone="slate" />
        <StatTile icon={UserCheck} label="Com rateio configurado" value={totals.configured} tone="emerald" />
        <StatTile icon={PieChart} label="Sem rateio (100% próprio)" value={totals.missing} tone="amber" />
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-2xl border border-slate-200/90 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 shadow-sm ring-slate-900/5 transition placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
          placeholder="Buscar por nome, login, perfil ou quantidade de cedentes…"
          aria-label="Buscar funcionário"
        />
      </div>

      {err ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm text-red-800 shadow-sm ring-1 ring-red-100/80">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" strokeWidth={2} aria-hidden />
          <span>{err}</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-slate-50/50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3.5 pl-5">Funcionário (owner)</th>
                <th className="px-4 py-3.5">Login</th>
                <th className="px-4 py-3.5">Cedentes</th>
                <th className="px-4 py-3.5">Vigência</th>
                <th className="min-w-[280px] px-4 py-3.5">Rateio</th>
                <th className="px-4 py-3.5 pr-5 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200/80">
                        <Search className="h-5 w-5" strokeWidth={2} aria-hidden />
                      </div>
                      <p className="font-medium text-slate-700">Nenhum resultado</p>
                      <p className="text-xs text-slate-500">Ajuste o termo de busca ou limpe o campo para ver todos.</p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12">
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
                      <Loader2 className="h-8 w-8 animate-spin text-sky-600" strokeWidth={2} aria-hidden />
                      <p className="text-sm font-medium">Carregando funcionários…</p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading || filtered.length > 0
                ? filtered.map((r) => {
                const hasVig = Boolean(r.effectiveFrom || r.effectiveTo);
                const vigFrom = r.effectiveFrom ? fmtDateBR(r.effectiveFrom) : "—";
                const vigTo = r.effectiveTo ? fmtDateBR(r.effectiveTo) : null;

                return (
                  <tr key={r.owner.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-4 pl-5 align-top">
                      <div className="font-semibold text-slate-900">{r.owner.name}</div>
                      <div className="mt-1.5">
                        <RoleBadge role={r.owner.role} />
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200/70">
                        {r.owner.login}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-bold text-slate-800 ring-1 ring-slate-200/60 tabular-nums">
                        {r.cedentesCount}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {!hasVig ? (
                        <span className="text-sm text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-medium ring-1 ring-slate-200/60">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
                            {vigFrom}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" strokeWidth={2} aria-hidden />
                          {vigTo ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs font-medium ring-1 ring-slate-200/60">
                              {vigTo}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200/70"
                              title="Sem data final"
                            >
                              <InfinityIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                              Aberto
                            </span>
                          )}
                        </div>
                      )}
                      {r.isDefault ? (
                        <div className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200/80">
                          Padrão 100%
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <RateioBreakdown row={r} />
                    </td>
                    <td className="px-4 py-4 pr-5 align-top">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 hover:text-sky-900"
                        >
                          {r.isDefault ? "Configurar" : "Novo rateio"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
              : null}
            </tbody>
          </table>
        </div>
      </div>

      {editingOwnerId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div
            className="flex max-h-[min(92vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/10 sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rateio-modal-title"
          >
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4 sm:px-6">
              <h2 id="rateio-modal-title" className="text-lg font-bold text-slate-900">
                Novo rateio com vigência
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                A soma das porcentagens deve ser <strong>100%</strong>. O novo rateio vale apenas a partir da data
                escolhida.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 ring-1 ring-slate-900/[0.03]">
                <div className="text-sm font-semibold text-slate-800">Vigente a partir de</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    type="date"
                    value={effectiveFrom}
                    min={minEffectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
                  />
                  <span className="text-xs text-slate-500">
                    Mínimo: <strong className="text-slate-700">{fmtDateBR(minEffectiveFrom)}</strong>
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Para não alterar períodos já fechados, prefira uma data futura.
                </p>
              </div>

              <div
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm ring-1",
                  Math.abs(sumPercent - 100) < 0.001
                    ? "border-emerald-200/90 bg-emerald-50/80 text-emerald-900 ring-emerald-100/80"
                    : "border-amber-200/90 bg-amber-50/80 text-amber-900 ring-amber-100/80"
                )}
              >
                Soma atual:{" "}
                <strong className="font-mono tabular-nums">{sumPercent.toFixed(2).replace(".", ",")}%</strong>
                {Math.abs(sumPercent - 100) < 0.001 ? (
                  <span className="ml-2 text-xs font-medium text-emerald-800">(ok)</span>
                ) : (
                  <span className="ml-2 text-xs font-medium text-amber-800">(ajuste para 100%)</span>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm ring-1 ring-slate-900/[0.03]">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5">Destinatário</th>
                      <th className="px-3 py-2.5">%</th>
                      <th className="px-3 py-2.5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editItems.map((it, idx) => (
                      <tr key={`${it.payeeId}-${idx}`} className="bg-white">
                        <td className="px-3 py-2.5">
                          <select
                            value={it.payeeId}
                            onChange={(e) =>
                              setEditItems((arr) =>
                                arr.map((x, i) => (i === idx ? { ...x, payeeId: e.target.value } : x))
                              )
                            }
                            className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                            disabled={!users.length}
                          >
                            {users.length === 0 ? (
                              <option value="">Sem usuários</option>
                            ) : (
                              users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name} ({u.login})
                                </option>
                              ))
                            )}
                          </select>
                        </td>

                        <td className="px-3 py-2.5">
                          <input
                            value={String(it.percent)}
                            onChange={(e) => {
                              const v = e.target.value.replace(",", ".");
                              const num = Number(v);
                              setEditItems((arr) =>
                                arr.map((x, i) =>
                                  i === idx ? { ...x, percent: Number.isFinite(num) ? num : 0 } : x
                                )
                              );
                            }}
                            className="w-28 rounded-xl border border-slate-200 bg-white px-2.5 py-2 font-mono text-sm shadow-sm focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                            inputMode="decimal"
                          />
                        </td>

                        <td className="px-3 py-2.5">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setEditItems((arr) => arr.filter((_, i) => i !== idx))}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-red-50 hover:text-red-800"
                              disabled={editItems.length <= 1}
                              title={editItems.length <= 1 ? "Precisa ter ao menos 1 linha" : "Remover linha"}
                            >
                              Remover
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={() => setEditItems((arr) => [...arr, { payeeId: users[0]?.id || "", percent: 0 }])}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-900"
                disabled={!users.length}
              >
                + Adicionar destinatário
              </button>

              {!canSave ? (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-100/80">
                  Para salvar: escolha uma data válida (não no passado), preencha todos os destinatários e deixe a soma em
                  exatamente 100%.
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closeEdit}
                className="inline-flex justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!canSave || saving}
                className="inline-flex justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar rateio"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
