"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Coins,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Unlock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  UNLOCK_BUFFER_DAYS,
  UNLOCK_WINDOW_DAYS,
  unlockYmdFromLastEmissionIso,
} from "@/lib/bloqueios-unlock";

type CedenteOpt = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  identificador: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  pontosIberia: number;
};

type Observation = { id: string; text: string; createdAt: string };

type BlockRow = {
  id: string;
  status: "OPEN" | "UNBLOCKED" | "CANCELED";
  program: "LATAM" | "SMILES" | "LIVELO" | "ESFERA" | "IBERIA";
  note?: string | null;
  estimatedUnlockAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  lastEmissionAt?: string | null;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string };
  pointsBlocked: number;
  valueBlockedCents: number;
  observations: Observation[];
};

type ListFilter = "OPEN" | "MONTH" | "ALL";

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}
function dateTimeBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}
function dateBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function recifeParts(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, x) => {
      acc[x.type] = x.value;
      return acc;
    }, {});
}

function recifeMonthISO(d = new Date()) {
  const p = recifeParts(d);
  return `${p.year}-${p.month}`;
}

function recifeMonthLabel(monthISO: string) {
  const [y, m] = monthISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const label = dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isoToInputDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = recifeParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function unlocksInMonth(b: BlockRow, monthISO: string) {
  if (b.status !== "OPEN" || !b.estimatedUnlockAt) return false;
  return recifeMonthISO(new Date(b.estimatedUnlockAt)) === monthISO;
}

function daysUntil(iso: string) {
  const targetYmd = isoToInputDate(iso);
  const p = recifeParts();
  const todayYmd = `${p.year}-${p.month}-${p.day}`;
  const t0 = new Date(`${todayYmd}T12:00:00-03:00`).getTime();
  const d0 = new Date(`${targetYmd}T12:00:00-03:00`).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(d0)) return 0;
  return Math.round((d0 - t0) / (1000 * 60 * 60 * 24));
}

function statusBadge(b: BlockRow) {
  if (b.status === "UNBLOCKED") {
    return { label: "Desbloqueado", cls: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80" };
  }
  if (b.status === "CANCELED") {
    return { label: "Cancelado", cls: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80" };
  }
  if (!b.estimatedUnlockAt) {
    return { label: "Em aberto", cls: "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80" };
  }
  const d = daysUntil(b.estimatedUnlockAt);
  if (d <= 0) {
    return { label: "Dia do desbloqueio", cls: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80" };
  }
  if (d <= 7) {
    return { label: `Faltam ${d} dia(s)`, cls: "bg-sky-50 text-sky-800 ring-1 ring-sky-200/80" };
  }
  return { label: "Em aberto", cls: "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80" };
}

function programChipCls(program: BlockRow["program"], active: boolean) {
  const on = active ? "ring-2 ring-slate-900" : "ring-1 ring-slate-200/80";
  return cn("rounded-xl border bg-white p-2", on);
}

export default function BloqueiosClient() {
  const [loading, setLoading] = useState(false);
  const [cedentes, setCedentes] = useState<CedenteOpt[]>([]);
  const [rows, setRows] = useState<BlockRow[]>([]);

  const [cedenteId, setCedenteId] = useState("");
  const [program, setProgram] = useState<BlockRow["program"]>("LATAM");
  const [note, setNote] = useState("");
  const [estimatedUnlockAt, setEstimatedUnlockAt] = useState("");
  const [createLastEmissionAt, setCreateLastEmissionAt] = useState<string | null>(null);

  const [obsText, setObsText] = useState<Record<string, string>>({});
  const [unlockDraft, setUnlockDraft] = useState<Record<string, string>>({});
  const [savingUnlockId, setSavingUnlockId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("OPEN");
  const [openCreate, setOpenCreate] = useState(false);

  const currentMonth = useMemo(() => recifeMonthISO(), []);
  const currentMonthLabel = useMemo(() => recifeMonthLabel(currentMonth), [currentMonth]);

  async function loadAll() {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/cedentes/options", { cache: "no-store" }),
        fetch("/api/bloqueios", { cache: "no-store" }),
      ]);

      const j1 = await r1.json();
      const j2 = await r2.json();

      if (!j1?.ok) throw new Error(j1?.error || "Erro ao carregar contas");
      if (!j2?.ok) throw new Error(j2?.error || "Erro ao carregar bloqueios");

      setCedentes(j1.data || []);
      const nextRows: BlockRow[] = j2.data.rows || [];
      setRows(nextRows);
      setUnlockDraft(Object.fromEntries(nextRows.map((r) => [r.id, isoToInputDate(r.estimatedUnlockAt)])));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!cedenteId) {
      setCreateLastEmissionAt(null);
      return;
    }

    let active = true;
    fetch(
      `/api/bloqueios?cedenteId=${encodeURIComponent(cedenteId)}&program=${encodeURIComponent(program)}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((j) => {
        if (!active) return;
        const iso = j?.data?.lastEmissionAt || null;
        setCreateLastEmissionAt(iso);
        if (iso && program === "LATAM") {
          setEstimatedUnlockAt(unlockYmdFromLastEmissionIso(iso));
        }
      })
      .catch(() => {
        if (!active) return;
        setCreateLastEmissionAt(null);
      });

    return () => {
      active = false;
    };
  }, [cedenteId, program]);

  const selectedCedente = useMemo(() => cedentes.find((c) => c.id === cedenteId) || null, [cedentes, cedenteId]);

  const preview = useMemo(() => {
    if (!selectedCedente) return { latam: 0, smiles: 0, livelo: 0, esfera: 0, iberia: 0 };
    return {
      latam: selectedCedente.pontosLatam || 0,
      smiles: selectedCedente.pontosSmiles || 0,
      livelo: selectedCedente.pontosLivelo || 0,
      esfera: selectedCedente.pontosEsfera || 0,
      iberia: selectedCedente.pontosIberia || 0,
    };
  }, [selectedCedente]);

  const totals = useMemo(() => {
    const open = rows.filter((r) => r.status === "OPEN");
    const points = open.reduce((a, r) => a + (r.pointsBlocked || 0), 0);
    const value = open.reduce((a, r) => a + (r.valueBlockedCents || 0), 0);
    return { openCount: open.length, pointsBlocked: points, valueBlockedCents: value };
  }, [rows]);

  const monthUnlock = useMemo(() => {
    const list = rows.filter((r) => unlocksInMonth(r, currentMonth));
    return {
      count: list.length,
      points: list.reduce((a, r) => a + (r.pointsBlocked || 0), 0),
      valueCents: list.reduce((a, r) => a + (r.valueBlockedCents || 0), 0),
    };
  }, [rows, currentMonth]);

  const visibleRows = useMemo(() => {
    const rankStatus = (status: BlockRow["status"]) => {
      if (status === "OPEN") return 0;
      if (status === "CANCELED") return 1;
      return 2;
    };
    const needle = q.trim().toLowerCase();

    return [...rows]
      .filter((r) => {
        if (listFilter === "OPEN" && r.status !== "OPEN") return false;
        if (listFilter === "MONTH" && !unlocksInMonth(r, currentMonth)) return false;
        if (!needle) return true;
        const hay = `${r.cedente.nomeCompleto} ${r.cedente.identificador} ${r.program} ${r.note || ""}`.toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        const statusDiff = rankStatus(a.status) - rankStatus(b.status);
        if (statusDiff !== 0) return statusDiff;
        if (a.status === "OPEN" && b.status === "OPEN") {
          const aHasUnlock = !!a.estimatedUnlockAt;
          const bHasUnlock = !!b.estimatedUnlockAt;
          if (aHasUnlock !== bHasUnlock) return aHasUnlock ? -1 : 1;
          if (aHasUnlock && bHasUnlock) {
            const aUnlock = new Date(a.estimatedUnlockAt as string).getTime();
            const bUnlock = new Date(b.estimatedUnlockAt as string).getTime();
            if (aUnlock !== bUnlock) return aUnlock - bUnlock;
          }
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (a.status === "UNBLOCKED" && b.status === "UNBLOCKED") {
          const aResolved = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
          const bResolved = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
          if (aResolved !== bResolved) return bResolved - aResolved;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [rows, listFilter, q, currentMonth]);

  async function createBlock() {
    if (!cedenteId) return alert("Selecione a conta (cedente).");

    setLoading(true);
    try {
      const res = await fetch("/api/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          program,
          note,
          estimatedUnlockAt: estimatedUnlockAt ? `${estimatedUnlockAt}T12:00:00.000Z` : null,
        }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao criar bloqueio");

      setCedenteId("");
      setProgram("LATAM");
      setNote("");
      setEstimatedUnlockAt("");
      setCreateLastEmissionAt(null);
      setOpenCreate(false);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao criar bloqueio");
    } finally {
      setLoading(false);
    }
  }

  async function addObs(blockId: string) {
    const text = (obsText[blockId] || "").trim();
    if (!text) return alert("Digite a observação/protocolo.");

    setLoading(true);
    try {
      const res = await fetch(`/api/bloqueios/${blockId}/observacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao adicionar observação");

      setObsText((p) => ({ ...p, [blockId]: "" }));
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao adicionar observação");
    } finally {
      setLoading(false);
    }
  }

  async function updateEstimatedUnlock(blockId: string, dateYmd: string) {
    setSavingUnlockId(blockId);
    try {
      const res = await fetch(`/api/bloqueios/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimatedUnlockAt: dateYmd ? `${dateYmd}T12:00:00.000Z` : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Erro ao atualizar previsão.");

      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar previsão.");
    } finally {
      setSavingUnlockId(null);
    }
  }

  async function markUnblocked(blockId: string) {
    if (!confirm("Marcar este bloqueio como DESBLOQUEADO?")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/bloqueios/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "UNBLOCKED" }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Erro ao atualizar status.");

      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contas bloqueadas</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Acompanhe protocolos, previsão de desbloqueio e o valor que deve voltar ao caixa em{" "}
            <b>{currentMonthLabel}</b>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={2} />
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => setOpenCreate((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Novo bloqueio
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            Bloqueios em aberto
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{totals.openCount}</div>
          <div className="mt-0.5 text-xs text-slate-500">contas ainda travadas</div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Coins className="h-3.5 w-3.5" />
            Pontos bloqueados
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtInt(totals.pointsBlocked)}</div>
          <div className="mt-0.5 text-xs text-slate-500">soma das contas em aberto</div>
        </div>
        <div className="rounded-2xl border border-slate-900 bg-slate-950 p-4 text-white shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            <ShieldAlert className="h-3.5 w-3.5" />
            Valor bloqueado
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{fmtMoney(totals.valueBlockedCents)}</div>
          <div className="mt-0.5 text-xs text-white/60">milheiros do Resumo</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
          Previsão de liberação · {currentMonthLabel}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setListFilter("MONTH")}
            className={cn(
              "rounded-2xl border p-4 text-left shadow-sm transition",
              listFilter === "MONTH"
                ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
                : "border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white hover:border-emerald-200"
            )}
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              <Unlock className="h-3.5 w-3.5" />
              Contas que desbloqueiam
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">{monthUnlock.count}</div>
            <div className="mt-0.5 text-xs text-emerald-800/80">com previsão neste mês</div>
          </button>
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              <CalendarCheck className="h-3.5 w-3.5" />
              Pontos a liberar
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">{fmtInt(monthUnlock.points)}</div>
            <div className="mt-0.5 text-xs text-emerald-800/80">dessas contas do mês</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-700 p-4 text-white shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Valor previsto</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{fmtMoney(monthUnlock.valueCents)}</div>
            <div className="mt-0.5 text-xs text-white/75">a voltar ao caixa neste mês</div>
          </div>
        </div>
      </div>

      {openCreate ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
          <div className="mb-4 text-sm font-semibold text-slate-900">Adicionar bloqueio</div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 md:col-span-2">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Conta (Cedente)</div>
              <select
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm"
                value={cedenteId}
                onChange={(e) => setCedenteId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {cedentes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nomeCompleto} • {c.identificador}
                  </option>
                ))}
              </select>

              {selectedCedente ? (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-700">Prévia de pontos</div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    <div className={programChipCls("LATAM", program === "LATAM")}>
                      <div className="text-[11px] text-slate-500">LATAM</div>
                      <div className="font-semibold tabular-nums">{fmtInt(preview.latam)}</div>
                    </div>
                    <div className={programChipCls("SMILES", program === "SMILES")}>
                      <div className="text-[11px] text-slate-500">SMILES</div>
                      <div className="font-semibold tabular-nums">{fmtInt(preview.smiles)}</div>
                    </div>
                    <div className={programChipCls("LIVELO", program === "LIVELO")}>
                      <div className="text-[11px] text-slate-500">LIVELO</div>
                      <div className="font-semibold tabular-nums">{fmtInt(preview.livelo)}</div>
                    </div>
                    <div className={programChipCls("ESFERA", program === "ESFERA")}>
                      <div className="text-[11px] text-slate-500">ESFERA</div>
                      <div className="font-semibold tabular-nums">{fmtInt(preview.esfera)}</div>
                    </div>
                    <div className={programChipCls("IBERIA", program === "IBERIA")}>
                      <div className="text-[11px] text-slate-500">IBERIA</div>
                      <div className="font-semibold tabular-nums">{fmtInt(preview.iberia)}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Só o programa selecionado entra no bloqueio.
                  </div>
                </div>
              ) : null}
            </label>

            <label className="space-y-1">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Programa</div>
              <select
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm"
                value={program}
                onChange={(e) => setProgram(e.target.value as BlockRow["program"])}
              >
                <option value="LATAM">LATAM</option>
                <option value="SMILES">Smiles</option>
                <option value="LIVELO">Livelo</option>
                <option value="ESFERA">Esfera</option>
                <option value="IBERIA">Iberia</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-[11px] font-semibold uppercase text-slate-500">
                Previsão desbloqueio
                {program === "LATAM" ? (
                  <span className="font-normal text-slate-400">
                    {" "}
                    ({UNLOCK_BUFFER_DAYS}+{UNLOCK_WINDOW_DAYS}d)
                  </span>
                ) : null}
              </div>
              {cedenteId ? (
                <div className="text-[11px] text-slate-500">
                  Última emissão: <b>{createLastEmissionAt ? dateBR(createLastEmissionAt) : "—"}</b>
                </div>
              ) : null}
              <input
                type="date"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm"
                value={estimatedUnlockAt}
                onChange={(e) => setEstimatedUnlockAt(e.target.value)}
              />
            </label>

            <label className="space-y-1 md:col-span-4">
              <div className="text-[11px] font-semibold uppercase text-slate-500">Observação inicial</div>
              <input
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm shadow-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: bloqueada após transferência, solicitada análise..."
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpenCreate(false)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={createBlock}
              className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={loading}
            >
              Adicionar
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
          {(
            [
              ["OPEN", "Em aberto"],
              ["MONTH", `Desbloqueiam ${currentMonthLabel.split(" ")[0]}`],
              ["ALL", "Todos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setListFilter(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                listFilter === id ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar conta, identificador ou programa..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10 md:w-80"
          />
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <Lock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Nenhum bloqueio nesta visão</p>
          <p className="mt-1 text-xs text-slate-500">Ajuste o filtro ou cadastre um bloqueio novo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map((b) => {
            const badge = statusBadge(b);
            const thisMonth = unlocksInMonth(b, currentMonth);

            return (
              <div
                key={b.id}
                className={cn(
                  "space-y-3 rounded-2xl border bg-white p-4 shadow-sm shadow-slate-200/30",
                  thisMonth ? "border-emerald-200" : "border-slate-200/80"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
                      <span className="truncate">
                        {b.cedente.nomeCompleto} · {b.program}
                      </span>
                      <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", badge.cls)}>
                        {badge.label}
                      </span>
                      {thisMonth ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                          Libera em {currentMonthLabel.split(" ")[0]}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-0.5 text-xs text-slate-500">
                      {b.cedente.identificador}
                      {b.resolvedAt ? ` · Resolvido: ${dateBR(b.resolvedAt)}` : ""}
                    </div>

                    {b.status === "OPEN" ? (
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
                          <span>
                            Criado: <b>{dateBR(b.createdAt)}</b>
                          </span>
                          <span>
                            Última emissão: <b>{b.lastEmissionAt ? dateBR(b.lastEmissionAt) : "—"}</b>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-500">Previsão desbloqueio:</span>
                          <input
                            type="date"
                            className="h-8 rounded-lg border border-slate-200 px-2 text-xs shadow-sm"
                            value={unlockDraft[b.id] ?? isoToInputDate(b.estimatedUnlockAt)}
                            disabled={savingUnlockId === b.id}
                            onChange={(e) => setUnlockDraft((p) => ({ ...p, [b.id]: e.target.value }))}
                            onBlur={(e) => {
                              const next = e.target.value;
                              const current = isoToInputDate(b.estimatedUnlockAt);
                              if (next !== current) updateEstimatedUnlock(b.id, next);
                            }}
                          />
                          <button
                            type="button"
                            className="h-8 rounded-lg border border-slate-200 px-2 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
                            disabled={!b.lastEmissionAt || savingUnlockId === b.id}
                            title={`${UNLOCK_BUFFER_DAYS} dias após a última emissão + ${UNLOCK_WINDOW_DAYS} dias`}
                            onClick={() => {
                              if (!b.lastEmissionAt) return;
                              const suggested = unlockYmdFromLastEmissionIso(b.lastEmissionAt);
                              if (!suggested) return;
                              setUnlockDraft((p) => ({ ...p, [b.id]: suggested }));
                              updateEstimatedUnlock(b.id, suggested);
                            }}
                          >
                            Sugerir 180 dias
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>Criado: {dateBR(b.createdAt)}</span>
                          <span>Última emissão: {b.lastEmissionAt ? dateBR(b.lastEmissionAt) : "—"}</span>
                        </div>
                        {b.estimatedUnlockAt ? <div>Previsão: {dateBR(b.estimatedUnlockAt)}</div> : null}
                      </div>
                    )}

                    {b.note ? <div className="mt-2 text-sm text-slate-700">{b.note}</div> : null}
                  </div>

                  <div className="shrink-0 space-y-2 text-right">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Bloqueado
                      </div>
                      <div className="font-semibold tabular-nums">{fmtInt(b.pointsBlocked)} pts</div>
                      <div className="text-sm font-semibold tabular-nums">{fmtMoney(b.valueBlockedCents)}</div>
                    </div>

                    {b.status === "OPEN" ? (
                      <button
                        type="button"
                        onClick={() => markUnblocked(b.id)}
                        className="h-9 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        disabled={loading}
                      >
                        Marcar como desbloqueado
                      </button>
                    ) : null}
                  </div>
                </div>

                {b.status === "OPEN" ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="mb-2 text-xs font-semibold text-slate-800">Observação / protocolo</div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <input
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm md:col-span-3"
                        placeholder="Ex: protocolo 12345, resposta da CIA..."
                        value={obsText[b.id] ?? ""}
                        onChange={(e) => setObsText((p) => ({ ...p, [b.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => addObs(b.id)}
                        className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                        disabled={loading}
                      >
                        Registrar
                      </button>
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-1 text-xs font-semibold text-slate-800">Histórico</div>
                  {b.observations.length === 0 ? (
                    <div className="text-sm text-slate-500">Nenhuma atualização registrada.</div>
                  ) : (
                    <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left">Data/hora</th>
                            <th className="px-3 py-2 text-left">Observação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.observations.map((o) => (
                            <tr key={o.id} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-2 text-slate-600">{dateTimeBR(o.createdAt)}</td>
                              <td className="px-3 py-2">{o.text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
