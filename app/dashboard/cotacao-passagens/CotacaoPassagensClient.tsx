"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, ExternalLink, Plane, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  buildAzulSearchUrl,
  buildLatamSearchUrl,
  buildSmilesSearchUrl,
  ciaKeyFromMilesAirline,
  fmtDurationMin,
  fmtFlightSchedule,
  isCashAirline,
  isMilesAirline,
  isScoutAirline,
  saleTotalCents,
  suggestedMilheiroCents,
} from "@/lib/cotacao-passagens";

type SearchRow = {
  id: string;
  direction: string;
  originIata: string;
  destIata: string;
  date: string;
  url: string;
  status: string;
  priceCents: number;
  miles?: number;
  airline: string;
  error: string | null;
  depTime?: string | null;
  arrTime?: string | null;
  durationMin?: number | null;
  stops?: number | null;
};

type Job = {
  id: string;
  status: string;
  origins: string;
  destinations: string;
  includeReturn: boolean;
  quoteMiles: number;
  quoteMilheiroCents: number;
  quoteBoardingFeeCents: number;
  quoteCia?: Record<string, { miles?: number; feeCents?: number; milheiroCents?: number }> | null;
  filterMaxDurationMin?: number | null;
  filterDepFrom?: string | null;
  filterDepTo?: string | null;
  filterDirectOnly?: boolean;
  searches: SearchRow[];
};

type CiaKey = "latam" | "smiles" | "azul";
type CiaDraft = { miles: string; fee: string; milheiro: string; milheiroManual: boolean };

const CIA_META: { key: CiaKey; label: string }[] = [
  { key: "latam", label: "LATAM" },
  { key: "smiles", label: "Smiles" },
  { key: "azul", label: "Azul" },
];

function emptyCia(): CiaDraft {
  return { miles: "", fee: "0,00", milheiro: "", milheiroManual: false };
}
function fromSaved(row?: { miles?: number; feeCents?: number; milheiroCents?: number } | null): CiaDraft {
  if (!row) return emptyCia();
  return {
    miles: row.miles ? String(row.miles) : "",
    fee: row.feeCents ? fromCents(row.feeCents) : "0,00",
    milheiro: row.milheiroCents ? fromCents(row.milheiroCents) : "",
    milheiroManual: Boolean(row.milheiroCents),
  };
}

const ZIP_HREF = "/downloads/trademiles-cotacao-gol-extension.zip";
const FIELD = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const INPUT =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "h-9 flex-1 rounded-lg px-3 text-sm font-semibold transition",
            value === o.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function toMiles(s: string) {
  return Math.max(0, Math.trunc(Number(String(s || "").replace(/\D/g, "")) || 0));
}
function toCents(s: string) {
  const n = Number(String(s || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function fromCents(cents: number) {
  return ((cents || 0) / 100).toFixed(2).replace(".", ",");
}
function fmtMiles(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" }).format(new Date());
}

export default function CotacaoPassagensClient() {
  const [origins, setOrigins] = useState("GRU, CGH, VCP");
  const [destinations, setDestinations] = useState("");
  const [outboundFrom, setOutboundFrom] = useState(todayISO);
  const [outboundTo, setOutboundTo] = useState("");
  const [tripKind, setTripKind] = useState<"ow" | "rt">("rt");
  const [dateKind, setDateKind] = useState<"exact" | "range">("exact");
  const [returnFrom, setReturnFrom] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [filterMaxHours, setFilterMaxHours] = useState("");
  const [filterDepFrom, setFilterDepFrom] = useState("");
  const [filterDepTo, setFilterDepTo] = useState("");
  const [filterDirectOnly, setFilterDirectOnly] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [startError, setStartError] = useState("");
  const [extOn, setExtOn] = useState(false);
  const [extReload, setExtReload] = useState(false);
  const [ciaQuotes, setCiaQuotes] = useState<Record<CiaKey, CiaDraft>>({
    latam: emptyCia(),
    smiles: emptyCia(),
    azul: emptyCia(),
  });
  const [hydratedJobId, setHydratedJobId] = useState("");
  const [minMilheiro, setMinMilheiro] = useState<Record<CiaKey, number>>({
    latam: 0,
    smiles: 0,
    azul: 0,
  });

  async function load(id?: string) {
    const qs = id ? `?id=${encodeURIComponent(id)}` : "";
    const r = await fetch(`/api/cotacao-passagens${qs}`, { cache: "no-store" });
    const j = await r.json();
    if (j?.ok && j.job) {
      setJob(j.job);
    }
    return j?.job as Job | null;
  }

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/cotacao-passagens", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j?.ok && j.job?.status === "RUNNING") setJob(j.job);
    })();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.tmCotacaoJob = job?.status === "RUNNING" && job.id ? job.id : "";
    const sync = () => {
      if (document.documentElement.dataset.tmCotacaoExt) setExtOn(true);
      if (document.documentElement.dataset.tmCotacaoExtReload) setExtReload(true);
    };
    const onBridge = (e: Event) => {
      const d = (e as CustomEvent<{ connected?: boolean; reload?: boolean }>).detail || {};
      setExtOn(Boolean(d.connected));
      if (d.reload) setExtReload(true);
    };
    sync();
    const t = window.setInterval(sync, 1500);
    window.addEventListener("tm-cotacao-bridge", onBridge);
    return () => {
      delete document.body.dataset.tmCotacaoJob;
      window.removeEventListener("tm-cotacao-bridge", onBridge);
      window.clearInterval(t);
    };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job || job.status !== "RUNNING") return;
    const t = setInterval(() => load(job.id), 2500);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/settings/cotacao-min-milheiro", { cache: "no-store", credentials: "include" });
      const j = await r.json().catch(() => null);
      if (j?.ok && j.data) {
        setMinMilheiro({
          latam: Number(j.data.latam) || 0,
          smiles: Number(j.data.smiles) || 0,
          azul: Number(j.data.azul) || 0,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!job?.id || job.id === hydratedJobId) return;
    const src = job.quoteCia || {};
    setCiaQuotes({
      latam: fromSaved(src.latam),
      smiles: fromSaved(src.smiles),
      azul: fromSaved(src.azul),
    });
    setHydratedJobId(job.id);
  }, [job?.id, hydratedJobId, job?.quoteCia]);

  useEffect(() => {
    if (!job?.searches?.length) return;
    setCiaQuotes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of job.searches) {
        if (s.status !== "OK" || !s.miles) continue;
        const key = ciaKeyFromMilesAirline(s.airline);
        if (!key) continue;
        if (toMiles(next[key].miles) === s.miles) continue;
        next[key] = { ...next[key], miles: String(s.miles), milheiroManual: false };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [job?.searches]);

  const bestIda = useMemo(() => {
    const ok = (job?.searches || []).filter((s) => s.direction === "IDA" && s.status === "OK" && s.priceCents > 0 && !isMilesAirline(s.airline));
    const cash = ok.filter((s) => isCashAirline(s.airline));
    const pool = cash.length ? cash : ok.filter((s) => isScoutAirline(s.airline) || isCashAirline(s.airline));
    return (pool.length ? pool : ok).sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);
  const bestVolta = useMemo(() => {
    const ok = (job?.searches || []).filter((s) => s.direction === "VOLTA" && s.status === "OK" && s.priceCents > 0 && !isMilesAirline(s.airline));
    const cash = ok.filter((s) => isCashAirline(s.airline));
    const pool = cash.length ? cash : ok.filter((s) => isScoutAirline(s.airline) || isCashAirline(s.airline));
    return (pool.length ? pool : ok).sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);

  const comboCents = job?.includeReturn ? (bestIda?.priceCents || 0) + (bestVolta?.priceCents || 0) : 0;
  const cashPrice = comboCents > 0 ? comboCents : bestIda?.priceCents || 0;
  const cashLabel = comboCents > 0 ? "À vista (ida + volta)" : `À vista${bestIda?.airline ? ` · ${bestIda.airline}` : ""}`;

  const ciaRows = useMemo(() => {
    return CIA_META.map(({ key, label }) => {
      const q = ciaQuotes[key];
      const milesN = toMiles(q.miles);
      const feeCents = toCents(q.fee);
      const minCents = minMilheiro[key] || 0;
      const fromCash = suggestedMilheiroCents(cashPrice, milesN, feeCents);
      const suggested = Math.max(fromCash, minCents);
      const milheiroCents = q.milheiroManual ? toCents(q.milheiro) : suggested;
      const total = milesN > 0 ? saleTotalCents(milesN, milheiroCents, feeCents) : 0;
      const discount = cashPrice > 0 && total > 0 ? cashPrice - total : 0;
      const discountPct = cashPrice > 0 && total > 0 ? Math.round((discount / cashPrice) * 1000) / 10 : 0;
      const belowMin = minCents > 0 && milheiroCents > 0 && milheiroCents < minCents;
      const meetsMin = minCents <= 0 || milheiroCents >= minCents;
      const usedFloor = minCents > 0 && suggested === minCents && fromCash > 0 && fromCash < minCents;
      return {
        key,
        label,
        milesN,
        feeCents,
        minCents,
        suggested,
        milheiroCents,
        total,
        discount,
        discountPct,
        belowMin,
        meetsMin,
        usedFloor,
        q,
      };
    });
  }, [ciaQuotes, cashPrice, minMilheiro]);

  const filledCias = ciaRows.filter((r) => r.milesN > 0 && r.total > 0);
  const viableCias = filledCias.filter((r) => r.meetsMin);
  const bestCia = viableCias.length
    ? viableCias.reduce((a, b) => (a.total <= b.total ? a : b))
    : null;
  const progress = useMemo(() => {
    const rows = job?.searches || [];
    const done = rows.filter((s) => !["PENDING", "RUNNING"].includes(s.status)).length;
    return { done, total: rows.length };
  }, [job]);
  const extOk = extOn || progress.done > 0;

  async function start() {
    const includeReturn = tripKind === "rt";
    const exact = dateKind === "exact";
    if (!outboundFrom) {
      alert("Informe a data de ida.");
      return;
    }
    if (!exact && (!outboundTo || outboundTo < outboundFrom)) {
      alert("No intervalo de ida, preencha de/até (a data final precisa ser igual ou depois da inicial).");
      return;
    }
    if (includeReturn) {
      if (!returnFrom) {
        alert("Informe a data de volta.");
        return;
      }
      if (!exact && (!returnTo || returnTo < returnFrom)) {
        alert("No intervalo de volta, preencha de/até (a data final precisa ser igual ou depois da inicial).");
        return;
      }
    }
    setStartError("");
    setLoading(true);
    try {
      const r = await fetch("/api/cotacao-passagens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origins,
          destinations,
          outboundFrom,
          outboundTo: exact ? outboundFrom : outboundTo,
          outboundDays: 1,
          includeReturn,
          returnFrom: includeReturn ? returnFrom : null,
          returnTo: includeReturn ? (exact ? returnFrom : returnTo) : null,
          returnDays: 1,
          filterMaxHours: filterMaxHours || null,
          filterDepFrom: filterDepFrom || null,
          filterDepTo: filterDepTo || null,
          filterDirectOnly,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setStartError(j?.error || `Não consegui criar a cotação (HTTP ${r.status}).`);
        return;
      }
      setJob(j.job);
      window.dispatchEvent(new Event("tm-cotacao-kick"));
      location.hash = `go-${Date.now()}`;
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Falha ao criar cotação.");
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    if (!job) return;
    await fetch(`/api/cotacao-passagens/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stop: true }),
    });
    load(job.id);
  }

  async function saveQuote() {
    if (!job) return;
    const quoteCia = Object.fromEntries(
      ciaRows.map((r) => [
        r.key,
        { miles: r.milesN, feeCents: r.feeCents, milheiroCents: r.milheiroCents },
      ])
    );
    const pick = bestCia || filledCias[0];
    await fetch(`/api/cotacao-passagens/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteCia,
        quoteMiles: pick?.milesN || 0,
        quoteMilheiroCents: pick?.milheiroCents || 0,
        quoteBoardingFeeCents: pick?.feeCents || 0,
      }),
    });
  }

  function patchCia(key: CiaKey, patch: Partial<CiaDraft>) {
    setCiaQuotes((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-12">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gestão de pontos</div>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
              <Plane className="h-6 w-6 text-slate-500" />
              Cotação de passagens
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Compare a menor tarifa à vista com a emissão em milhas nas 3 cias. Data exata pesquisa GOL, LATAM e Azul
              em dinheiro e depois as milhas. Intervalo: o Decolar acha a data mais barata, confirma na cia e só nessa
              data puxa LATAM, Smiles e Azul em milhas.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-full px-3 text-[11px] font-semibold",
                extOk ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
              )}
            >
              {extOk ? "Extensão conectada" : "Instale a extensão para cotar"}
            </div>
            <a
              href={ZIP_HREF}
              download
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Baixar extensão
            </a>
          </div>
        </div>
        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            { n: "1", t: "À vista", d: "Data exata nas cias · intervalo no Decolar" },
            { n: "2", t: "Milhas nas 3", d: "LATAM, Smiles e Azul na data escolhida" },
            { n: "3", t: "Compare", d: "Milhas vs cia mais barata em dinheiro" },
          ].map((s) => (
            <li
              key={s.n}
              className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                {s.n}
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{s.t}</span>
                <span className="text-xs text-slate-500">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Passo 1</div>
          <div className="mb-4 text-sm font-semibold">Onde e quando pesquisar</div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={FIELD}>Aeroportos de origem (IATA)</label>
              <input value={origins} onChange={(e) => setOrigins(e.target.value)} className={INPUT} placeholder="GRU, CGH, VCP" />
            </div>
            <div className="md:col-span-2">
              <label className={FIELD}>Aeroportos de destino (IATA)</label>
              <input
                value={destinations}
                onChange={(e) => setDestinations(e.target.value)}
                className={INPUT}
                placeholder="SSA, REC, SAO"
              />
            </div>
            <div className="md:col-span-2 space-y-3">
              <Segmented
                value={tripKind}
                onChange={setTripKind}
                options={[
                  { id: "ow", label: "Só ida" },
                  { id: "rt", label: "Ida e volta" },
                ]}
              />
              <Segmented
                value={dateKind}
                onChange={setDateKind}
                options={[
                  { id: "exact", label: "Data exata" },
                  { id: "range", label: "Intervalo" },
                ]}
              />
            </div>
            {dateKind === "exact" ? (
              <>
                <div className={tripKind === "ow" ? "md:col-span-2" : ""}>
                  <label className={FIELD}>Dia da ida</label>
                  <input type="date" value={outboundFrom} onChange={(e) => setOutboundFrom(e.target.value)} className={INPUT} />
                </div>
                {tripKind === "rt" ? (
                  <div>
                    <label className={FIELD}>Dia da volta</label>
                    <input type="date" value={returnFrom} onChange={(e) => setReturnFrom(e.target.value)} className={INPUT} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <label className={FIELD}>Ida de</label>
                  <input type="date" value={outboundFrom} onChange={(e) => setOutboundFrom(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={FIELD}>Ida até</label>
                  <input type="date" value={outboundTo} onChange={(e) => setOutboundTo(e.target.value)} className={INPUT} />
                </div>
                {tripKind === "rt" ? (
                  <>
                    <div>
                      <label className={FIELD}>Volta de</label>
                      <input type="date" value={returnFrom} onChange={(e) => setReturnFrom(e.target.value)} className={INPUT} />
                    </div>
                    <div>
                      <label className={FIELD}>Volta até</label>
                      <input type="date" value={returnTo} onChange={(e) => setReturnTo(e.target.value)} className={INPUT} />
                    </div>
                  </>
                ) : null}
                <p className="md:col-span-2 text-xs text-slate-500">O intervalo pesquisa um dia de cada vez (máx. 30).</p>
              </>
            )}
            <div className="md:col-span-2 mt-1 border-t border-slate-100 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Filtros do voo (opcional)
            </div>
            <div>
              <label className={FIELD}>Duração máxima (horas)</label>
              <input
                value={filterMaxHours}
                onChange={(e) => setFilterMaxHours(e.target.value)}
                className={INPUT}
                placeholder="ex.: 3 ou 2,5"
              />
            </div>
            <div>
              <label className={FIELD}>Sai a partir de</label>
              <input
                type="time"
                value={filterDepFrom}
                onChange={(e) => setFilterDepFrom(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label className={FIELD}>Sai até</label>
              <input type="time" value={filterDepTo} onChange={(e) => setFilterDepTo(e.target.value)} className={INPUT} />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={filterDirectOnly}
                onChange={(e) => setFilterDirectOnly(e.target.checked)}
              />
              Somente voos diretos
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={start}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              {loading ? "Montando..." : "Iniciar cotação"}
            </button>
            {job?.status === "RUNNING" ? (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-800"
              >
                <Square className="h-3.5 w-3.5" />
                Parar
              </button>
            ) : null}
          </div>
          {startError ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
              {startError}
            </div>
          ) : null}
          {extReload ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              A extensão foi atualizada com esta aba aberta e perdeu o contato. Recarregue a página (⌘R) e clique de
              novo em Iniciar cotação.
            </div>
          ) : null}
          {job?.status === "RUNNING" ? (
            <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
              Pesquisando {progress.done}/{progress.total}. Abre uma janela atrás desta (cias, Decolar ou milhas) — se
              não abrir, recarregue a aba e inicie de novo.
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Data exata: dinheiro nas 3 cias e, na mesma data, milhas nas 3. Intervalo: Decolar em cada dia, confirma a
            cia mais barata e puxa milhas só nessa data. O veredito compara as milhas com a cia mais barata à vista.
            {job ? ` ${progress.done}/${progress.total} concluídas.` : ""}
          </p>
        </div>

        <div className="space-y-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:pt-1">
            Passo 2 · Menor tarifa à vista
          </div>
          {job ? (
            <p className="text-xs text-slate-500">
              Desta cotação: {job.origins} → {job.destinations}
              {job.includeReturn ? " · ida e volta" : " · só ida"}
            </p>
          ) : null}
          <BestCard title="Ida mais barata" row={bestIda} running={job?.status === "RUNNING"} />
          {job?.includeReturn ? (
            <BestCard title="Volta mais barata" row={bestVolta} running={job?.status === "RUNNING"} />
          ) : null}
          {job && (job.filterMaxDurationMin || job.filterDepFrom || job.filterDepTo || job.filterDirectOnly) ? (
            <p className="text-xs text-slate-500">
              Filtro desta cotação:{" "}
              {[
                job.filterMaxDurationMin ? `até ${fmtDurationMin(job.filterMaxDurationMin)}` : "",
                job.filterDepFrom && job.filterDepTo
                  ? `sai ${job.filterDepFrom}–${job.filterDepTo}`
                  : job.filterDepFrom
                    ? `sai a partir de ${job.filterDepFrom}`
                    : job.filterDepTo
                      ? `sai até ${job.filterDepTo}`
                      : "",
                job.filterDirectOnly ? "somente direto" : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {cashPrice > 0 ? (
            <div className="rounded-2xl border border-slate-900 bg-slate-900 p-4 text-white shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{cashLabel}</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{fmtMoney(cashPrice)}</div>
              <p className="mt-1 text-xs text-slate-300">Este é o preço de referência. A emissão em milhas precisa ficar abaixo disso.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Passo 3</div>
        <div className="text-sm font-semibold">Milhas das 3 cias vs o dinheiro mais barato</div>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          A extensão preenche as milhas da data escolhida. O milheiro sugerido fica ~5% abaixo da tarifa à vista mais
          barata, mas nunca abaixo do{" "}
          <Link href="/dashboard/configuracoes" className="font-semibold text-slate-800 underline">
            mínimo cadastrado em Configurações
          </Link>
          . Se você baixar na mão, a cia entra em prejuízo e não entra no veredito.
        </p>

        {bestCia && cashPrice ? (
          <div className="mt-4 flex flex-col gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <CheckCircle2 className="h-4 w-4" />
                Melhor sem prejuízo: emitir na {bestCia.label}
              </div>
              <p className="mt-0.5 text-sm text-emerald-800">
                Cobre {fmtMoney(bestCia.total)} no cliente. vs à vista o desconto é{" "}
                <b>{fmtMoney(bestCia.discount)}</b> ({bestCia.discountPct}%). Milheiro {fmtMoney(bestCia.milheiroCents)}
                {bestCia.minCents ? ` (mínimo ${fmtMoney(bestCia.minCents)})` : ""}.
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase text-emerald-700">Milheiro</div>
              <div className="text-xl font-bold tabular-nums text-emerald-950">{fmtMoney(bestCia.milheiroCents)}</div>
            </div>
          </div>
        ) : filledCias.length && !bestCia ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Tem cotação preenchida, mas todas ficaram abaixo do milheiro mínimo. Ajuste a cobrança ou o piso em
            Configurações para não vender no prejuízo.
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {cashPrice
              ? "Preencha milhas e taxa em pelo menos uma cia para aparecer o veredito."
              : "Espere o preço à vista (passo 2) para o milheiro sugerido aparecer."}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {ciaRows.map((r) => {
            const win = bestCia?.key === r.key && r.total > 0;
            const barMax = Math.max(cashPrice, ...ciaRows.map((x) => x.total), 1);
            const quoteRow = bestIda;
            const href =
              r.key === "latam" && quoteRow
                ? buildLatamSearchUrl(quoteRow.originIata, quoteRow.destIata, quoteRow.date)
                : r.key === "smiles" && quoteRow
                  ? buildSmilesSearchUrl(quoteRow.originIata, quoteRow.destIata, quoteRow.date)
                  : r.key === "azul" && quoteRow
                    ? buildAzulSearchUrl(quoteRow.originIata, quoteRow.destIata, quoteRow.date)
                    : "";
            return (
              <div
                key={r.key}
                className={cn(
                  "flex flex-col rounded-2xl border p-4",
                  win
                    ? "border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200"
                    : r.belowMin
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-slate-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{r.label}</div>
                  {win ? (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      Melhor
                    </span>
                  ) : null}
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:underline"
                  >
                    Abrir busca da ida <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">A busca aparece depois do preço da ida.</p>
                )}
                <div className="mt-3 grid gap-2">
                  <div>
                    <label className={FIELD}>Milhas que a cia pediu</label>
                    <input
                      value={r.q.miles}
                      onChange={(e) => patchCia(r.key, { miles: e.target.value, milheiroManual: false })}
                      className={INPUT}
                      placeholder="ex: 24000"
                    />
                  </div>
                  <div>
                    <label className={FIELD}>Taxa de embarque (R$)</label>
                    <input
                      value={r.q.fee}
                      onChange={(e) => patchCia(r.key, { fee: e.target.value, milheiroManual: false })}
                      className={INPUT}
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className={FIELD}>Milheiro que você cobra (R$)</label>
                    <input
                      value={r.q.milheiroManual ? r.q.milheiro : r.suggested ? fromCents(r.suggested) : ""}
                      onChange={(e) => patchCia(r.key, { milheiro: e.target.value, milheiroManual: true })}
                      className={INPUT}
                      placeholder="18,00"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Mínimo da cia: {r.minCents ? fmtMoney(r.minCents) : "não cadastrado"}
                      {r.usedFloor ? " · sugestão subiu até o piso" : ""}
                      {r.suggested ? ` · sugerido ${fmtMoney(r.suggested)}` : ""}
                      {r.q.milheiroManual ? (
                        <button
                          type="button"
                          className="ml-2 font-semibold text-slate-800 underline"
                          onClick={() => patchCia(r.key, { milheiroManual: false, milheiro: "" })}
                        >
                          voltar à sugestão
                        </button>
                      ) : null}
                    </p>
                    {r.belowMin ? (
                      <p className="mt-1 text-[11px] font-semibold text-amber-800">
                        Abaixo do mínimo — prejuízo. Esta cia não entra no veredito.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex-1 rounded-xl bg-white/80 p-3 ring-1 ring-slate-100">
                  <div className="text-[11px] font-semibold uppercase text-slate-400">Cliente paga</div>
                  <div className="text-2xl font-bold tabular-nums text-slate-900">
                    {r.total ? fmtMoney(r.total) : "—"}
                  </div>
                  {r.milesN ? (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {fmtMiles(r.milesN)} milhas × {fmtMoney(r.milheiroCents)} + taxa {fmtMoney(r.feeCents)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-slate-400">Ainda sem milhas nesta cia.</p>
                  )}
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full", win ? "bg-emerald-500" : "bg-slate-400")}
                      style={{ width: `${r.total ? Math.max(8, Math.round((r.total / barMax) * 100)) : 0}%` }}
                    />
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-sm font-semibold tabular-nums",
                      r.discount > 0 ? "text-emerald-700" : r.discount < 0 ? "text-rose-700" : "text-slate-500"
                    )}
                  >
                    {r.total && cashPrice
                      ? r.discount >= 0
                        ? `Economia de ${fmtMoney(r.discount)} (${r.discountPct}%) vs à vista`
                        : `${fmtMoney(Math.abs(r.discount))} mais caro que à vista`
                      : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Referência à vista: <b className="text-slate-800">{cashPrice ? fmtMoney(cashPrice) : "ainda sem preço"}</b>
          </p>
          <button
            type="button"
            onClick={saveQuote}
            disabled={!job}
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Salvar números
          </button>
        </div>
      </div>

      {job?.searches?.length ? (
        <details className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-800 marker:content-none">
            Detalhe das pesquisas à vista
            <span className="ml-2 text-xs font-normal text-slate-500">
              {progress.done}/{progress.total} datas
            </span>
          </summary>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="p-3">Trecho</th>
                <th className="p-3">Data</th>
                <th className="p-3">Cia</th>
                <th className="p-3">Horário</th>
                <th className="p-3">Preço / milhas</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {job.searches.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="p-3 font-medium">
                    {s.direction === "VOLTA" ? "Volta" : "Ida"} {s.originIata} → {s.destIata}
                  </td>
                  <td className="p-3">{s.date.split("-").reverse().join("/")}</td>
                  <td className="p-3">{s.airline || "—"}</td>
                  <td className="p-3 text-xs text-slate-600">{fmtFlightSchedule(s) || "—"}</td>
                  <td className="p-3 tabular-nums">
                    {s.miles
                      ? `${fmtMiles(s.miles)} milhas`
                      : s.priceCents
                        ? fmtMoney(s.priceCents)
                        : "—"}
                  </td>
                  <td className="p-3 text-xs">{s.status === "ERRO" && s.error ? s.error : s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function BestCard({ title, row, running }: { title: string; row: SearchRow | null; running?: boolean }) {
  const latam = row ? buildLatamSearchUrl(row.originIata, row.destIata, row.date) : "";
  const smiles = row ? buildSmilesSearchUrl(row.originIata, row.destIata, row.date) : "";
  const azul = row ? buildAzulSearchUrl(row.originIata, row.destIata, row.date) : "";
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      {row ? (
        <>
          <div className="mt-1 text-lg font-bold">
            {row.originIata} → {row.destIata}
          </div>
          <div className="text-sm text-slate-600">
            {row.date.split("-").reverse().join("/")} · {row.airline || "Cia não identificada"}
          </div>
          {fmtFlightSchedule(row) ? (
            <div className="mt-1 text-sm font-medium text-slate-800">{fmtFlightSchedule(row)}</div>
          ) : null}
          <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">{fmtMoney(row.priceCents)}</div>
          <div className="mt-1 text-xs text-slate-500">
            Tarifa à vista{row.airline ? ` · ${row.airline}` : ""}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {latam ? (
              <a
                href={latam}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-800"
              >
                LATAM <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {smiles ? (
              <a
                href={smiles}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-800"
              >
                Smiles <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {azul ? (
              <a
                href={azul}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-800"
              >
                Azul <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-slate-500">
          {running ? "Aguardando o primeiro resultado da extensão…" : "Ainda sem resultado."}
        </div>
      )}
    </div>
  );
}
