"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Gift, KeyRound, PauseCircle, RefreshCw, Search, Users, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { liveloCycleBadgeClass } from "@/lib/livelo-clube";

type Status = "ACTIVE" | "PAUSED" | "CANCELED";

type Item = {
  id: string;
  cedenteId: string;
  status: Status;
  tierK: number;
  renewalDay: number;
  monthlyBonusPoints: number;
  subscribedAt: string;
  lastRenewedAt: string | null;
  renewedThisCycle: boolean;
  cycleMonth: number;
  cycleTotal: number;
  cycleLabel: string;
  updatedAt: string;
  cedente: {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    senhaLivelo: string | null;
    owner: {
      id: string;
      name: string;
      login: string;
    };
  };
};

type Draft = {
  renewalDay: string;
  monthlyBonusPoints: string;
};

function fmtInt(v: number) {
  return new Intl.NumberFormat("pt-BR").format(v || 0);
}

function fmtDateBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function statusClass(status: Status) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PAUSED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function statusLabel(status: Status) {
  if (status === "ACTIVE") return "ATIVO";
  if (status === "PAUSED") return "PAUSADO";
  return "CANCELADO";
}

function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}

const INPUT =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-slate-900/10";
const TH =
  "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function SummaryCard({
  title,
  value,
  hint,
  icon,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone: "slate" | "emerald" | "amber" | "violet";
}) {
  const tones = {
    slate: "from-slate-500 to-slate-700",
    emerald: "from-emerald-500 to-teal-600",
    amber: "from-amber-500 to-orange-600",
    violet: "from-violet-500 to-indigo-600",
  } as const;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div
        className={cn(
          "pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl",
          tones[tone]
        )}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            tones[tone]
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
          <div className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900">{value}</div>
          {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}

function CredField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const text = String(value || "").trim();
  const empty = !text;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 break-all text-lg font-semibold tabular-nums text-slate-900">
        {empty ? "—" : text}
      </div>
      <button
        type="button"
        disabled={empty}
        onClick={onCopy}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export default function LiveloBonusClubeClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [renewSavingId, setRenewSavingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | Status>("");
  const [credOpenRowId, setCredOpenRowId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState("");

  const credRow = useMemo(
    () => items.find((r) => r.id === credOpenRowId) || null,
    [items, credOpenRowId]
  );

  useEffect(() => {
    if (!credOpenRowId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCredOpenRowId(null);
        setCopiedField("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [credOpenRowId]);

  async function copyValue(field: string, value: string | null | undefined) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((cur) => (cur === field ? "" : cur)), 1600);
    } catch {
      /* ignore */
    }
  }

  function closeCredentials() {
    setCredOpenRowId(null);
    setCopiedField("");
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contas-selecionadas/livelo/bonus-clube", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar bônus clube Livelo.");
      }

      const rows = (json.items || []) as Item[];
      setItems(rows);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          next[r.id] = {
            renewalDay: String(r.renewalDay ?? 1),
            monthlyBonusPoints: String(r.monthlyBonusPoints ?? 0),
          };
        }
        return next;
      });
    } catch (e: any) {
      setItems([]);
      setError(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!qq) return true;
      const hay =
        `${r.cedente.nomeCompleto} ${r.cedente.identificador} ${r.cedente.cpf} ${r.cedente.owner.name} ${r.cedente.owner.login}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q, statusFilter]);

  const totals = useMemo(() => {
    const totalClubes = filtered.length;
    const totalBonusMes = filtered.reduce((acc, r) => acc + Number(r.monthlyBonusPoints || 0), 0);
    const ativos = filtered.filter((r) => r.status === "ACTIVE").length;
    const faltaRenovar = filtered.filter((r) => r.status !== "CANCELED" && !r.renewedThisCycle).length;
    return { totalClubes, totalBonusMes, ativos, faltaRenovar };
  }, [filtered]);

  function setDraftField(id: string, key: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { renewalDay: "1", monthlyBonusPoints: "0" }),
        [key]: value,
      },
    }));
  }

  async function toggleRenewed(id: string, renewed: boolean) {
    setRenewSavingId(id);
    try {
      const res = await fetch("/api/contas-selecionadas/livelo/bonus-clube", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, renewedThisCycle: renewed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao marcar renovação.");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao marcar renovação.");
    } finally {
      setRenewSavingId(null);
    }
  }

  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;

    const renewalDay = Number(onlyDigits(d.renewalDay || ""));
    const monthlyBonusPoints = Number(onlyDigits(d.monthlyBonusPoints || ""));

    if (!Number.isFinite(renewalDay) || renewalDay < 1 || renewalDay > 31) {
      alert("Dia de renovação deve ser entre 1 e 31.");
      return;
    }

    if (!Number.isFinite(monthlyBonusPoints) || monthlyBonusPoints < 0) {
      alert("Bônus mensal deve ser um número maior ou igual a 0.");
      return;
    }

    setSavingId(id);
    try {
      const res = await fetch("/api/contas-selecionadas/livelo/bonus-clube", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          renewalDay,
          monthlyBonusPoints,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao salvar.");
      }
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar registro.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Análise & Estratégia
            </div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Bônus clube Livelo</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Ciclo mensal, bônus de pontos e renovação. Ao liberar uma compra com clube Livelo, o bônus entra
              sozinho.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <Link
              href="/dashboard/clubes/cadastrar"
              className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Cadastrar clube
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Clubes listados"
          value={fmtInt(totals.totalClubes)}
          hint={statusFilter || q ? "com o filtro atual" : "todos os clubes"}
          tone="slate"
          icon={<Users className="h-5 w-5" />}
        />
        <SummaryCard
          title="Bônus mensal"
          value={`${fmtInt(totals.totalBonusMes)} pts`}
          hint="soma do que está na lista"
          tone="violet"
          icon={<Gift className="h-5 w-5" />}
        />
        <SummaryCard
          title="Ativos"
          value={fmtInt(totals.ativos)}
          hint="assinatura em dia"
          tone="emerald"
          icon={<Check className="h-5 w-5" />}
        />
        <SummaryCard
          title="Falta renovar"
          value={fmtInt(totals.faltaRenovar)}
          hint="neste ciclo, sem cancelados"
          tone="amber"
          icon={<PauseCircle className="h-5 w-5" />}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 md:flex-row md:items-center md:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, ID, CPF ou responsável"
            className={cn(INPUT, "w-full pl-9")}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "", label: "Todos" },
              { id: "ACTIVE", label: "Ativos" },
              { id: "PAUSED", label: "Pausados" },
              { id: "CANCELED", label: "Cancelados" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id || "all"}
              type="button"
              onClick={() => setStatusFilter(opt.id)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-semibold transition",
                statusFilter === opt.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-50/90">
              <tr>
                <th className={TH}>Cedente</th>
                <th className={TH}>Clube</th>
                <th className={TH}>Ciclo</th>
                <th className={TH}>Renovação</th>
                <th className={TH}>Bônus/mês</th>
                <th className={TH}>Renovado</th>
                <th className={TH}>Status</th>
                <th className={TH}>Assinado</th>
                <th className={TH}>Atualizado</th>
                <th className={cn(TH, "text-right")}>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => {
                const d = drafts[r.id] || {
                  renewalDay: String(r.renewalDay ?? 1),
                  monthlyBonusPoints: String(r.monthlyBonusPoints ?? 0),
                };
                const dirty =
                  Number(onlyDigits(d.renewalDay)) !== Number(r.renewalDay) ||
                  Number(onlyDigits(d.monthlyBonusPoints)) !== Number(r.monthlyBonusPoints);

                return (
                  <tr key={r.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900">{r.cedente.nomeCompleto}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {r.cedente.identificador} · CPF {r.cedente.cpf}
                          </div>
                          <div className="text-xs text-slate-400">
                            {r.cedente.owner.name} · @{r.cedente.owner.login}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCopiedField("");
                            setCredOpenRowId((cur) => (cur === r.id ? null : r.id));
                          }}
                          className={cn(
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition",
                            credOpenRowId === r.id
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          )}
                          title="Credenciais Livelo"
                          aria-expanded={credOpenRowId === r.id}
                        >
                          <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden />
                          <span className="sr-only">Credenciais</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-800">Clube {fmtInt(r.tierK)}k</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          liveloCycleBadgeClass(r.cycleMonth || 1)
                        )}
                        title={r.cycleLabel || `Mês ${r.cycleMonth || 1} de ${r.cycleTotal || 12}`}
                      >
                        {r.cycleLabel || `Mês ${r.cycleMonth || 1} de ${r.cycleTotal || 12}`}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <input
                        value={d.renewalDay}
                        onChange={(e) =>
                          setDraftField(r.id, "renewalDay", onlyDigits(e.target.value).slice(0, 2))
                        }
                        className={cn(INPUT, "w-[72px]")}
                        inputMode="numeric"
                        aria-label="Dia de renovação"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <input
                        value={d.monthlyBonusPoints}
                        onChange={(e) =>
                          setDraftField(r.id, "monthlyBonusPoints", onlyDigits(e.target.value).slice(0, 7))
                        }
                        className={cn(INPUT, "w-[120px] tabular-nums")}
                        inputMode="numeric"
                        aria-label="Bônus mensal em pontos"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(r.renewedThisCycle)}
                          disabled={renewSavingId === r.id || r.status === "CANCELED"}
                          onChange={(e) => void toggleRenewed(r.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                        />
                        {renewSavingId === r.id ? "..." : r.renewedThisCycle ? "Sim" : "Não"}
                      </label>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          statusClass(r.status)
                        )}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-600">{fmtDateBR(r.subscribedAt)}</td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-600">{fmtDateBR(r.updatedAt)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => saveRow(r.id)}
                        disabled={savingId === r.id}
                        className={cn(
                          "h-9 rounded-xl px-3 text-xs font-semibold disabled:opacity-60",
                          dirty
                            ? "bg-slate-900 text-white hover:bg-slate-800"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {savingId === r.id ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={10}>
                    {loading ? "Carregando clubes Livelo…" : "Nenhum clube Livelo encontrado."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {credRow ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            aria-label="Fechar credenciais"
            onClick={closeCredentials}
          />
          <div
            role="dialog"
            aria-label="Credenciais Livelo"
            className="absolute left-1/2 top-1/2 w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Credenciais Livelo</div>
                <div className="text-sm text-slate-500">
                  {credRow.cedente.nomeCompleto} • {credRow.cedente.identificador}
                </div>
              </div>
              <button
                type="button"
                onClick={closeCredentials}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <CredField
                label="CPF (login)"
                value={credRow.cedente.cpf}
                copied={copiedField === "cpf"}
                onCopy={() => copyValue("cpf", credRow.cedente.cpf)}
              />
              <CredField
                label="Senha Livelo"
                value={credRow.cedente.senhaLivelo || ""}
                copied={copiedField === "senhaLivelo"}
                onCopy={() => copyValue("senhaLivelo", credRow.cedente.senhaLivelo)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
