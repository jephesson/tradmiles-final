"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";

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
    if (!qq) return items;
    return items.filter((r) => {
      const hay =
        `${r.cedente.nomeCompleto} ${r.cedente.identificador} ${r.cedente.cpf} ${r.cedente.owner.name} ${r.cedente.owner.login}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q]);

  const totals = useMemo(() => {
    const totalClubes = filtered.length;
    const totalBonusMes = filtered.reduce(
      (acc, r) => acc + Number(r.monthlyBonusPoints || 0),
      0
    );
    return { totalClubes, totalBonusMes };
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
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bônus clube Livelo</h1>
          <p className="text-sm text-slate-500">
            Clubes Livelo cadastrados com ciclo mensal, bônus de pontos e controle de renovação.
            Ao liberar uma compra com clube Livelo, o bônus é sincronizado automaticamente.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50"
            type="button"
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <Link
            href="/dashboard/clubes/cadastrar"
            className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cadastrar clube
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Clubes Livelo listados</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.totalClubes)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Bônus mensal total</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.totalBonusMes)} pts</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500">Filtro</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, ID, CPF, responsável..."
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-4 py-2">Cedente</th>
                <th className="text-left px-4 py-2">Clube</th>
                <th className="text-left px-4 py-2">Ciclo</th>
                <th className="text-left px-4 py-2">Renovação (dia)</th>
                <th className="text-left px-4 py-2">Bônus/mês (pts)</th>
                <th className="text-left px-4 py-2">Renovado</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Assinado em</th>
                <th className="text-left px-4 py-2">Atualizado em</th>
                <th className="text-right px-4 py-2">Ação</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filtered.map((r) => {
                const d = drafts[r.id] || {
                  renewalDay: String(r.renewalDay ?? 1),
                  monthlyBonusPoints: String(r.monthlyBonusPoints ?? 0),
                };

                return (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{r.cedente.nomeCompleto}</div>
                          <div className="text-xs text-neutral-500">
                            {r.cedente.identificador} • CPF {r.cedente.cpf}
                          </div>
                          <div className="text-xs text-neutral-500">
                            Resp: {r.cedente.owner.name} @{r.cedente.owner.login}
                          </div>
                        </div>

                        <div className="relative shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCopiedField("");
                              setCredOpenRowId((cur) => (cur === r.id ? null : r.id));
                            }}
                            className={cn(
                              "group relative rounded-lg border p-1.5 shadow-sm outline-none transition-colors",
                              credOpenRowId === r.id
                                ? "border-sky-400 bg-sky-50 text-sky-800"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                            )}
                            title="Credenciais Livelo"
                            aria-expanded={credOpenRowId === r.id}
                          >
                            <KeyRound className="h-4 w-4" strokeWidth={2} aria-hidden />
                            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                              Credenciais
                            </span>
                          </button>

                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-2">
                      Clube {fmtInt(r.tierK)}k
                    </td>

                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                          liveloCycleBadgeClass(r.cycleMonth || 1)
                        )}
                        title={r.cycleLabel || `Mês ${r.cycleMonth || 1} de ${r.cycleTotal || 12}`}
                      >
                        {r.cycleLabel || `Mês ${r.cycleMonth || 1} de ${r.cycleTotal || 12}`}
                      </span>
                    </td>

                    <td className="px-4 py-2">
                      <input
                        value={d.renewalDay}
                        onChange={(e) =>
                          setDraftField(r.id, "renewalDay", onlyDigits(e.target.value).slice(0, 2))
                        }
                        className="w-24 rounded-md border px-2 py-1"
                        inputMode="numeric"
                      />
                    </td>

                    <td className="px-4 py-2">
                      <input
                        value={d.monthlyBonusPoints}
                        onChange={(e) =>
                          setDraftField(
                            r.id,
                            "monthlyBonusPoints",
                            onlyDigits(e.target.value).slice(0, 7)
                          )
                        }
                        className="w-40 rounded-md border px-2 py-1"
                        inputMode="numeric"
                      />
                    </td>

                    <td className="px-4 py-2">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(r.renewedThisCycle)}
                          disabled={renewSavingId === r.id || r.status === "CANCELED"}
                          onChange={(e) => void toggleRenewed(r.id, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {r.renewedThisCycle ? "Sim" : "Não"}
                      </label>
                    </td>

                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${statusClass(
                          r.status
                        )}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>

                    <td className="px-4 py-2">{fmtDateBR(r.subscribedAt)}</td>
                    <td className="px-4 py-2">{fmtDateBR(r.updatedAt)}</td>

                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveRow(r.id)}
                        disabled={savingId === r.id}
                        className="rounded-md border border-black bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {savingId === r.id ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!filtered.length && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={10}>
                    Nenhum clube Livelo encontrado.
                  </td>
                </tr>
              )}
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
