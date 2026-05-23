// app/dashboard/contas-selecionadas/smiles/renovacao-clube/SmilesRenovacaoClubeClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  MessageCircle,
  Plane,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone?: string | null;
  pontosSmiles: number;
  owner: Owner;
};

type Item = {
  id: string;
  cedenteId: string;
  tierK: number;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
  smilesBonusEligibleAt: string;
  cedente: CedenteLite;
};

type PendingAvailableItem = {
  cedenteId: string;
  createdAt: string;
  bucket: "RECENT" | "PREVIOUS_MONTH_PENDING";
  cedente: CedenteLite & {
    status: "PENDING" | "APPROVED" | "REJECTED";
    createdAt: string;
  };
};

type CredentialsState = {
  cedenteId: string;
  nomeCompleto: string;
  identificador: string;
  cpf: string;
  email: string | null;
  senhaEmail: string | null;
  senhaSmiles: string | null;
};

const CONTROL =
  "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15";

const SUMMARY_ACCENT = {
  slate: "from-slate-500 to-slate-600",
  emerald: "from-emerald-500 to-teal-600",
  amber: "from-amber-500 to-orange-600",
  orange: "from-orange-500 to-amber-600",
} as const;

function ymdFromISO(iso: string) {
  return String(iso || "").slice(0, 10);
}
function ymFromISO(iso: string) {
  return String(iso || "").slice(0, 7);
}

function compareYM(a: string, b: string) {
  return a.localeCompare(b);
}

function monthLabelPT(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(d);
}

function fmtDateBR(iso: string | null) {
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
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "-";
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function whatsappHref(telefone?: string | null) {
  let d = String(telefone || "").replace(/\D+/g, "");
  if (!d) return null;
  while (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;
  return `https://wa.me/${d}`;
}

function statusRank(s: Item["status"]) {
  if (s === "ACTIVE") return 3;
  if (s === "PAUSED") return 2;
  return 1;
}

function dedupLatestByCedente(list: Item[]) {
  const map = new Map<string, Item>();

  for (const it of list) {
    const key = it.cedenteId || it.cedente?.id || it.id;
    const cur = map.get(key);

    if (!cur) {
      map.set(key, it);
      continue;
    }

    const a = String(cur.smilesBonusEligibleAt || "");
    const b = String(it.smilesBonusEligibleAt || "");

    if (b.localeCompare(a) > 0) {
      map.set(key, it);
      continue;
    }
    if (b.localeCompare(a) < 0) continue;

    if (statusRank(it.status) > statusRank(cur.status)) {
      map.set(key, it);
    }
  }

  return Array.from(map.values());
}

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: keyof typeof SUMMARY_ACCENT;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 transition hover:shadow-md">
      <div
        className={cn(
          "pointer-events-none absolute -right-3 -top-3 h-20 w-20 rounded-full bg-gradient-to-br opacity-[0.12] blur-2xl",
          SUMMARY_ACCENT[tone]
        )}
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm",
            SUMMARY_ACCENT[tone]
          )}
        >
          {tone === "emerald" ? (
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          ) : tone === "amber" || tone === "orange" ? (
            <Clock className="h-5 w-5" aria-hidden />
          ) : tone === "slate" ? (
            <Users className="h-5 w-5" aria-hidden />
          ) : (
            <Sparkles className="h-5 w-5" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums tracking-tight text-slate-900">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function CedenteActions({
  telefone,
  onCredentials,
}: {
  telefone?: string | null;
  onCredentials: () => void;
}) {
  const wa = whatsappHref(telefone);

  return (
    <div className="flex items-center justify-end gap-1.5">
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
          title="Abrir WhatsApp do cedente"
        >
          <MessageCircle size={16} aria-hidden />
          <span className="sr-only">WhatsApp</span>
        </a>
      ) : (
        <span
          className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-300"
          title="Telefone não cadastrado"
        >
          <MessageCircle size={16} aria-hidden />
        </span>
      )}

      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
        title="Credenciais Smiles"
        onClick={onCredentials}
      >
        <KeyRound size={16} aria-hidden />
        <span className="sr-only">Credenciais</span>
      </button>
    </div>
  );
}

function CedenteCell({ cedente }: { cedente: CedenteLite }) {
  return (
    <td className="px-3 py-3.5">
      <div className="font-semibold text-slate-900">{cedente.nomeCompleto}</div>
      <div className="text-xs text-slate-500">
        {cedente.identificador} • CPF {maskCpf(cedente.cpf)}
      </div>
    </td>
  );
}

export default function SmilesRenovacaoClubeClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingAvailable, setPendingAvailable] = useState<PendingAvailableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [credentials, setCredentials] = useState<CredentialsState | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState("");
  const [copiedField, setCopiedField] = useState("");

  const todayYMD = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const currentYM = todayYMD.slice(0, 7);
  const [selectedYM, setSelectedYM] = useState<string>(currentYM);
  const [showPendingAvailable, setShowPendingAvailable] = useState(true);

  async function load(monthKey = selectedYM || currentYM) {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/contas-selecionadas/smiles/renovacao-clube?monthKey=${encodeURIComponent(monthKey)}`,
        { cache: "no-store", credentials: "include" }
      );
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar");

      const raw: Item[] = Array.isArray(json.items) ? json.items : [];
      setItems(dedupLatestByCedente(raw));
      setPendingAvailable(
        Array.isArray(json.pendingAvailable) ? json.pendingAvailable : []
      );
    } catch (e: unknown) {
      setItems([]);
      setPendingAvailable([]);
      setErr(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(selectedYM || currentYM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYM, currentYM]);

  const monthsFromData = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(ymFromISO(it.smilesBonusEligibleAt));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const monthOptions = useMemo(() => {
    const all = new Set<string>([currentYM, selectedYM, ...monthsFromData]);
    const sorted = Array.from(all).sort((a, b) => a.localeCompare(b));
    return [currentYM, ...sorted.filter((k) => k !== currentYM)];
  }, [currentYM, monthsFromData, selectedYM]);

  useEffect(() => {
    if (!selectedYM) return;
    if (!monthOptions.includes(selectedYM)) setSelectedYM(currentYM);
  }, [selectedYM, monthOptions, currentYM]);

  const groupedByMonth = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const key = ymFromISO(it.smilesBonusEligibleAt);
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) =>
        ymdFromISO(a.smilesBonusEligibleAt).localeCompare(
          ymdFromISO(b.smilesBonusEligibleAt)
        )
      );
      map.set(k, arr);
    }
    return map;
  }, [items]);

  const selectedItems = useMemo(() => {
    const exactMonth = groupedByMonth.get(selectedYM) || [];

    if (selectedYM !== currentYM) {
      return exactMonth;
    }

    return [...items]
      .filter((it) => compareYM(ymFromISO(it.smilesBonusEligibleAt), selectedYM) <= 0)
      .sort((a, b) => {
        const aCarryOver = ymFromISO(a.smilesBonusEligibleAt) < selectedYM ? 0 : 1;
        const bCarryOver = ymFromISO(b.smilesBonusEligibleAt) < selectedYM ? 0 : 1;
        if (aCarryOver !== bCarryOver) return aCarryOver - bCarryOver;

        const av = ymdFromISO(a.smilesBonusEligibleAt);
        const bv = ymdFromISO(b.smilesBonusEligibleAt);
        if (av !== bv) return av.localeCompare(bv);
        return a.cedente.nomeCompleto.localeCompare(b.cedente.nomeCompleto);
      });
  }, [groupedByMonth, selectedYM, currentYM, items]);

  const selectedIsCurrentMonth = selectedYM === currentYM;

  const pendingStats = useMemo(() => {
    const recent = pendingAvailable.filter((it) => it.bucket === "RECENT");
    const carryOver = pendingAvailable.filter(
      (it) => it.bucket === "PREVIOUS_MONTH_PENDING"
    );
    const totalPoints = pendingAvailable.reduce(
      (acc, it) => acc + (it.cedente?.pontosSmiles || 0),
      0
    );
    return {
      total: pendingAvailable.length,
      totalPoints,
      recentCount: recent.length,
      carryOverCount: carryOver.length,
    };
  }, [pendingAvailable]);

  const selectedStats = useMemo(() => {
    const totalCedentes = selectedItems.length;
    const totalPontos = selectedItems.reduce(
      (acc, it) => acc + (it.cedente?.pontosSmiles || 0),
      0
    );

    const already = selectedItems.filter(
      (it) => ymdFromISO(it.smilesBonusEligibleAt) <= todayYMD
    );
    const future = selectedItems.filter(
      (it) => ymdFromISO(it.smilesBonusEligibleAt) > todayYMD
    );

    return {
      totalCedentes,
      totalPontos,
      alreadyCount: already.length,
      futureCount: future.length,
      already,
      future,
    };
  }, [selectedItems, todayYMD]);

  const reportByMonth = useMemo(() => {
    return monthOptions.map((ym) => {
      const list = groupedByMonth.get(ym) || [];
      const count = list.length;
      const sumPoints = list.reduce(
        (acc, it) => acc + (it.cedente?.pontosSmiles || 0),
        0
      );
      return { ym, count, sumPoints };
    });
  }, [monthOptions, groupedByMonth]);

  async function copyValue(fieldId: string, value?: string | null) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      window.setTimeout(() => {
        setCopiedField((curr) => (curr === fieldId ? "" : curr));
      }, 1400);
    } catch {
      // noop
    }
  }

  async function openCredentials(cedente: CedenteLite) {
    setCredentials({
      cedenteId: cedente.id,
      nomeCompleto: cedente.nomeCompleto,
      identificador: cedente.identificador,
      cpf: cedente.cpf,
      email: null,
      senhaEmail: null,
      senhaSmiles: null,
    });
    setCredentialsError("");
    setCredentialsLoading(true);

    try {
      const res = await fetch(
        `/api/cedentes/credentials?cedenteId=${encodeURIComponent(
          cedente.id
        )}&program=SMILES`,
        { cache: "no-store", credentials: "include" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao carregar credenciais.");
      }

      setCredentials({
        cedenteId: cedente.id,
        nomeCompleto: cedente.nomeCompleto,
        identificador: cedente.identificador,
        cpf: String(json.data?.cpf || cedente.cpf || ""),
        email: json.data?.email ?? null,
        senhaEmail: json.data?.senhaEmail ?? null,
        senhaSmiles: json.data?.senhaPrograma ?? null,
      });
    } catch (e: unknown) {
      setCredentialsError(
        e instanceof Error ? e.message : "Falha ao carregar credenciais."
      );
    } finally {
      setCredentialsLoading(false);
    }
  }

  const tableHead =
    "border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className="space-y-6 bg-gradient-to-br from-slate-50/80 via-white to-orange-50/25 p-6 pb-10">
      {/* Hero */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-orange-950 to-amber-900 p-5 text-white shadow-lg shadow-slate-900/10 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-orange-100">
              <Plane className="h-3.5 w-3.5" aria-hidden />
              Contas selecionadas · Smiles
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">
              Renovação Clube • Promo
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Agrupamento por mês da data <strong className="text-white">Promo SMILES</strong>.
              Após essa data, o cedente volta a ficar apto para assinar novamente com bônus.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => load(selectedYM || currentYM)}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
            <Link
              href="/dashboard/clubes"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Ver Clubes
            </Link>
          </div>
        </div>
      </section>

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      {/* Controls */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-sm font-semibold text-slate-700">Mês selecionado</label>
            <select
              value={selectedYM}
              onChange={(e) => setSelectedYM(e.target.value)}
              className={cn(CONTROL, "min-w-[260px]")}
            >
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {monthLabelPT(ym)}
                  {ym === currentYM ? " (mês atual)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              Hoje (UTC): {fmtDateBR(`${todayYMD}T12:00:00.000Z`)}
            </span>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm transition hover:bg-slate-50">
              <input
                type="checkbox"
                checked={showPendingAvailable}
                onChange={(e) => setShowPendingAvailable(e.target.checked)}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500/30"
              />
              Mostrar não assinadas (mês atual + anterior)
            </label>
          </div>
        </div>
      </section>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Cedentes no mês"
          value={fmtInt(selectedStats.totalCedentes)}
          tone="slate"
        />
        <SummaryCard
          title="Total pontos SMILES"
          value={fmtInt(selectedStats.totalPontos)}
          tone="orange"
        />
        <SummaryCard
          title={
            selectedIsCurrentMonth ? "Já liberados (mês atual)" : "Liberados (até hoje)"
          }
          value={fmtInt(selectedStats.alreadyCount)}
          tone="emerald"
        />
        <SummaryCard
          title={
            selectedIsCurrentMonth
              ? "Ainda vão liberar (mês atual)"
              : "Ainda não liberados"
          }
          value={fmtInt(selectedStats.futureCount)}
          tone="amber"
        />
      </div>

      {/* Current month split */}
      {selectedIsCurrentMonth ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 to-white px-4 py-3 md:px-5">
              <div className="h-8 w-1 rounded-full bg-emerald-500" aria-hidden />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Já liberados neste mês</h2>
                <p className="text-xs text-slate-500">Promo SMILES ≤ hoje</p>
              </div>
            </div>
            <div className="overflow-x-auto p-2 md:p-3">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className={tableHead}>
                    <th className="px-3 py-2.5">Cedente</th>
                    <th className="px-3 py-2.5">Promo SMILES</th>
                    <th className="px-3 py-2.5 text-right">Pontos</th>
                    <th className="px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStats.already.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-slate-500" colSpan={4}>
                        Nenhum cedente liberado ainda neste mês.
                      </td>
                    </tr>
                  ) : null}
                  {selectedStats.already.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-slate-50 transition hover:bg-slate-50/80 last:border-b-0"
                    >
                      <CedenteCell cedente={it.cedente} />
                      <td className="px-3 py-3.5">{fmtDateBR(it.smilesBonusEligibleAt)}</td>
                      <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                        {fmtInt(it.cedente.pontosSmiles)}
                      </td>
                      <td className="px-3 py-3.5">
                        <CedenteActions
                          telefone={it.cedente.telefone}
                          onCredentials={() => openCredentials(it.cedente)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-amber-50/80 to-white px-4 py-3 md:px-5">
              <div className="h-8 w-1 rounded-full bg-amber-500" aria-hidden />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Vão liberar neste mês</h2>
                <p className="text-xs text-slate-500">Data exata de liberação</p>
              </div>
            </div>
            <div className="overflow-x-auto p-2 md:p-3">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className={tableHead}>
                    <th className="px-3 py-2.5">Cedente</th>
                    <th className="px-3 py-2.5">Libera em</th>
                    <th className="px-3 py-2.5 text-right">Pontos</th>
                    <th className="px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStats.future.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-slate-500" colSpan={4}>
                        Nenhum cedente restante para liberar neste mês.
                      </td>
                    </tr>
                  ) : null}
                  {selectedStats.future.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-slate-50 transition hover:bg-slate-50/80 last:border-b-0"
                    >
                      <CedenteCell cedente={it.cedente} />
                      <td className="px-3 py-3.5">{fmtDateBR(it.smilesBonusEligibleAt)}</td>
                      <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                        {fmtInt(it.cedente.pontosSmiles)}
                      </td>
                      <td className="px-3 py-3.5">
                        <CedenteActions
                          telefone={it.cedente.telefone}
                          onCredentials={() => openCredentials(it.cedente)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {showPendingAvailable ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-sky-50/80 to-white px-4 py-3 md:px-5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-sky-500" aria-hidden />
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Disponíveis para assinatura em {monthLabelPT(selectedYM || currentYM)}
                </h2>
                <p className="text-xs text-slate-500">
                  Cadastros do mês + contas do mês anterior sem clube SMILES
                </p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Registros: {fmtInt(pendingStats.total)}</div>
              <div>
                Recentes: {fmtInt(pendingStats.recentCount)} • Anterior:{" "}
                {fmtInt(pendingStats.carryOverCount)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto p-2 md:p-3">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="px-3 py-2.5">Cedente</th>
                  <th className="px-3 py-2.5">Responsável</th>
                  <th className="px-3 py-2.5">Cadastrado em</th>
                  <th className="px-3 py-2.5">Faixa</th>
                  <th className="px-3 py-2.5 text-right">Pontos</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendingAvailable.length === 0 && !loading ? (
                  <tr>
                    <td className="px-3 py-8 text-slate-500" colSpan={7}>
                      Nenhuma conta recente ou pendente do mês anterior sem assinatura.
                    </td>
                  </tr>
                ) : null}

                {pendingAvailable.map((it) => (
                  <tr
                    key={it.cedenteId}
                    className="border-b border-slate-50 transition hover:bg-slate-50/80 last:border-b-0"
                  >
                    <CedenteCell cedente={it.cedente} />
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-slate-800">{it.cedente.owner?.name}</div>
                      <div className="text-xs text-slate-500">@{it.cedente.owner?.login}</div>
                    </td>
                    <td className="px-3 py-3.5">{fmtDateBR(it.createdAt)}</td>
                    <td className="px-3 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          it.bucket === "RECENT"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {it.bucket === "RECENT" ? "CADASTRO RECENTE" : "MÊS ANTERIOR"}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                      {fmtInt(it.cedente.pontosSmiles)}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        DISPONÍVEL P/ ASSINAR
                      </span>
                      <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                        {it.cedente.status}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <CedenteActions
                          telefone={it.cedente.telefone}
                          onCredentials={() => openCredentials(it.cedente)}
                        />
                        <Link
                          href={`/dashboard/clubes/cadastrar?program=SMILES&cedenteId=${encodeURIComponent(
                            it.cedenteId
                          )}`}
                          className="inline-flex items-center rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 transition hover:bg-orange-100"
                        >
                          Assinar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {loading ? (
                  <tr>
                    <td className="px-3 py-8 text-slate-500" colSpan={7}>
                      <span className="inline-flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                        Carregando…
                      </span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Main month table */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-orange-50/80 to-white px-4 py-3 md:px-5">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-orange-500" aria-hidden />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Cedentes aptos em {monthLabelPT(selectedYM || currentYM)}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedIsCurrentMonth
                  ? "Inclui liberados de meses anteriores ainda não usados"
                  : "Ordenado pela data Promo SMILES"}
              </p>
            </div>
          </div>
          <div className="text-xs font-medium text-slate-500">
            Registros: {fmtInt(selectedItems.length)}
          </div>
        </div>

        <div className="overflow-x-auto p-2 md:p-3">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2.5">Cedente</th>
                <th className="px-3 py-2.5">Responsável</th>
                <th className="px-3 py-2.5">Tier</th>
                <th className="px-3 py-2.5">Promo SMILES</th>
                <th className="px-3 py-2.5 text-right">Pontos</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.length === 0 && !loading ? (
                <tr>
                  <td className="px-3 py-8 text-slate-500" colSpan={7}>
                    Nenhum cedente com Promo SMILES neste mês.
                  </td>
                </tr>
              ) : null}

              {selectedItems.map((it) => {
                const eligible = ymdFromISO(it.smilesBonusEligibleAt) <= todayYMD;
                const carryOver =
                  selectedIsCurrentMonth &&
                  ymFromISO(it.smilesBonusEligibleAt) < selectedYM;

                return (
                  <tr
                    key={it.id}
                    className="border-b border-slate-50 transition hover:bg-slate-50/80 last:border-b-0"
                  >
                    <CedenteCell cedente={it.cedente} />
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-slate-800">{it.cedente.owner?.name}</div>
                      <div className="text-xs text-slate-500">@{it.cedente.owner?.login}</div>
                    </td>
                    <td className="px-3 py-3.5 font-medium">{it.tierK}k</td>
                    <td className="px-3 py-3.5">
                      {fmtDateBR(it.smilesBonusEligibleAt)}
                      {carryOver ? (
                        <span className="ml-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                          saldo mês anterior
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                      {fmtInt(it.cedente.pontosSmiles)}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          eligible
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {eligible ? "LIBERADO" : "AGUARDANDO"}
                      </span>
                      <span
                        className={cn(
                          "ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          it.status === "ACTIVE"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : it.status === "PAUSED"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-rose-200 bg-rose-50 text-rose-700"
                        )}
                        title="Status do clube"
                      >
                        {it.status}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <CedenteActions
                        telefone={it.cedente.telefone}
                        onCredentials={() => openCredentials(it.cedente)}
                      />
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td className="px-3 py-8 text-slate-500" colSpan={7}>
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                      Carregando…
                    </span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Report */}
      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white px-4 py-3 md:px-5">
          <h2 className="text-sm font-bold text-slate-900">Relatório por mês</h2>
          <p className="text-xs text-slate-500">
            Cedentes que liberam a Promo SMILES em cada mês + soma de pontos
          </p>
        </div>
        <div className="overflow-x-auto p-2 md:p-3">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className={tableHead}>
                <th className="px-3 py-2.5">Mês</th>
                <th className="px-3 py-2.5 text-right">Cedentes</th>
                <th className="px-3 py-2.5 text-right">Soma pontos</th>
              </tr>
            </thead>
            <tbody>
              {reportByMonth.map((r) => (
                <tr
                  key={r.ym}
                  className={cn(
                    "border-b border-slate-50 transition hover:bg-slate-50/80 last:border-b-0",
                    r.ym === selectedYM && "bg-orange-50/50"
                  )}
                >
                  <td className="px-3 py-3.5">
                    <button
                      type="button"
                      onClick={() => setSelectedYM(r.ym)}
                      className="font-medium text-slate-900 hover:text-orange-700 hover:underline"
                      title="Selecionar mês"
                    >
                      {monthLabelPT(r.ym)}
                      {r.ym === currentYM ? " (mês atual)" : ""}
                    </button>
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums">
                    {fmtInt(r.count)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold tabular-nums">
                    {fmtInt(r.sumPoints)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-slate-500">
        Fonte: ClubSubscription (SMILES) + smilesBonusEligibleAt + pontosSmiles. Disponíveis:
        Cedente.createdAt sem clube SMILES.
      </p>

      {credentials ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            aria-label="Fechar credenciais"
            onClick={() => {
              setCredentials(null);
              setCredentialsError("");
              setCopiedField("");
            }}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-900">Credenciais Smiles</div>
                <div className="text-sm text-slate-500">
                  {credentials.nomeCompleto} • {credentials.identificador}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCredentials(null);
                  setCredentialsError("");
                  setCopiedField("");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border text-slate-600 hover:bg-slate-100"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {credentialsError ? (
              <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {credentialsError}
              </div>
            ) : null}

            {credentialsLoading ? (
              <div className="rounded-xl border bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Carregando credenciais…
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">CPF (login)</div>
                  <div className="mt-1 break-all font-medium">{credentials.cpf || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("cpf", credentials.cpf)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "cpf" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Senha Smiles
                  </div>
                  <div className="mt-1 break-all font-medium">
                    {credentials.senhaSmiles || "-"}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyValue("senhaSmiles", credentials.senhaSmiles)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} />{" "}
                    {copiedField === "senhaSmiles" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">E-mail</div>
                  <div className="mt-1 break-all font-medium">{credentials.email || "-"}</div>
                  <button
                    type="button"
                    onClick={() => copyValue("email", credentials.email)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "email" ? "Copiado" : "Copiar"}
                  </button>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Senha do e-mail
                  </div>
                  <div className="mt-1 break-all font-medium">
                    {credentials.senhaEmail || "-"}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyValue("senhaEmail", credentials.senhaEmail)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
                  >
                    <Copy size={13} /> {copiedField === "senhaEmail" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
