"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Plane, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  buildAzulSearchUrl,
  buildLatamSearchUrl,
  buildSmilesSearchUrl,
  ciaKeyFromMilesAirline,
  fmtFlightSchedule,
  isMilesAirline,
  isScoutAirline,
  durationMinFromClocks,
  parseClock,
  resolvedDurationMin,
  saleTotalCents,
  suggestedMilheiroCents,
} from "@/lib/cotacao-passagens";
import { CotacaoShareActions, CotacaoShareCard, type ShareLeg } from "./CotacaoShareCard";

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
  rawPrice?: string | null;
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
  quoteCia?: Record<
    string,
    { miles?: number; feeCents?: number; milheiroCents?: number; depTime?: string; arrTime?: string }
  > | null;
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
function fmtIataField(raw: string) {
  return String(raw || "").toUpperCase();
}
function fmtMiles(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" }).format(new Date());
}
function dateBr(iso: string) {
  return String(iso || "").split("-").reverse().join("/");
}
function cashCarrier(row: SearchRow) {
  const raw = String(row.rawPrice || "").split(/[-·|]/)[0]?.trim();
  if (raw && !/^r\$/i.test(raw) && raw.length < 28) return raw;
  if (row.airline && !/^(google|decolar)$/i.test(row.airline)) return row.airline;
  return "Google Flights";
}
function toShareLeg(row: SearchRow | null): ShareLeg | null {
  if (!row) return null;
  return {
    origin: row.originIata,
    dest: row.destIata,
    dateBr: dateBr(row.date),
    airline: isMilesAirline(row.airline) ? row.airline.replace(/ milhas/i, "") : cashCarrier(row),
    depTime: row.depTime || null,
    arrTime: row.arrTime || null,
    durationMin: resolvedDurationMin(row),
    stops: typeof row.stops === "number" ? row.stops : null,
  };
}
function pickMilesSearch(searches: SearchRow[], key: CiaKey, direction: string) {
  return (
    searches.find(
      (s) =>
        s.direction === direction &&
        ciaKeyFromMilesAirline(s.airline) === key &&
        (s.depTime || s.arrTime || s.durationMin)
    ) || null
  );
}

function milesShareLeg(
  searches: SearchRow[],
  key: CiaKey,
  direction: "IDA" | "VOLTA",
  ciaLabel: string,
  cashLeg: ShareLeg | null,
  quote?: { depTime?: string; arrTime?: string } | null
): ShareLeg | null {
  const fromSearch = toShareLeg(pickMilesSearch(searches, key, direction));
  const quoteDep = direction === "IDA" ? parseClock(quote?.depTime || "") : "";
  const quoteArr = direction === "IDA" ? parseClock(quote?.arrTime || "") : "";
  const dep = fromSearch?.depTime || quoteDep || "";
  const arr = fromSearch?.arrTime || quoteArr || "";
  const base = fromSearch || cashLeg;
  if (!base) return null;
  const durationMin = durationMinFromClocks(dep, arr) || fromSearch?.durationMin || null;
  return {
    ...base,
    airline: ciaLabel,
    depTime: dep || null,
    arrTime: arr || null,
    durationMin,
    stops: fromSearch?.stops ?? null,
  };
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
  const [captureOn, setCaptureOn] = useState(false);
  const [extReload, setExtReload] = useState(false);
  const [ciaQuotes, setCiaQuotes] = useState<Record<CiaKey, CiaDraft>>({
    latam: emptyCia(),
    smiles: emptyCia(),
    azul: emptyCia(),
  });
  const [shareCia, setShareCia] = useState<CiaKey | null>(null);
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
      if (j?.ok && j.job) setJob(j.job);
    })();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.tmCotacaoJob = job?.id || "";
    const sync = () => {
      if (document.documentElement.dataset.tmCotacaoExt) setExtOn(true);
      if (document.documentElement.dataset.tmCotacaoExtReload) setExtReload(true);
      if (document.documentElement.dataset.tmCaptureOn === "1") setCaptureOn(true);
      if (document.documentElement.dataset.tmCaptureOn === "0") setCaptureOn(false);
    };
    const onBridge = (e: Event) => {
      const d = (e as CustomEvent<{ connected?: boolean; reload?: boolean; captureOn?: boolean }>).detail || {};
      setExtOn(Boolean(d.connected));
      if (d.captureOn != null) setCaptureOn(Boolean(d.captureOn));
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
    if (!job?.id) return;
    const t = setInterval(() => load(job.id), job.status === "RUNNING" ? 2000 : 4000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job?.id || job.status !== "RUNNING") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      await fetch("/api/cotacao-passagens/fill", { method: "POST", credentials: "include" }).catch(() => null);
      if (!stop) window.setTimeout(tick, 800);
    };
    void tick();
    return () => {
      stop = true;
    };
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
    const src = job?.quoteCia;
    if (!src || !job?.id) return;
    setCiaQuotes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of ["latam", "smiles", "azul"] as CiaKey[]) {
        const row = src[key];
        if (!row?.miles) continue;
        if (toMiles(next[key].miles) === row.miles && toCents(next[key].fee) === (row.feeCents || 0)) continue;
        next[key] = fromSaved(row);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [job?.id, job?.quoteCia]);

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
    const ok = (job?.searches || []).filter(
      (s) => s.direction === "IDA" && s.status === "OK" && s.priceCents > 0 && !isMilesAirline(s.airline)
    );
    const decolar = ok.filter((s) => isScoutAirline(s.airline));
    return (decolar.length ? decolar : ok).sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);
  const bestVolta = useMemo(() => {
    const ok = (job?.searches || []).filter(
      (s) => s.direction === "VOLTA" && s.status === "OK" && s.priceCents > 0 && !isMilesAirline(s.airline)
    );
    const decolar = ok.filter((s) => isScoutAirline(s.airline));
    return (decolar.length ? decolar : ok).sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);

  const comboCents = job?.includeReturn ? (bestIda?.priceCents || 0) + (bestVolta?.priceCents || 0) : 0;
  const cashPrice = comboCents > 0 ? comboCents : bestIda?.priceCents || 0;
  const cashLabel = comboCents > 0 ? "À vista (ida + volta)" : bestIda ? "À vista · Google Flights" : "À vista";
  const googleError = (job?.searches || []).find(
    (s) => isScoutAirline(s.airline) && s.status === "ERRO" && s.error
  )?.error || "";

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
  const activeCiaKey: CiaKey | null =
    (shareCia && filledCias.some((r) => r.key === shareCia) ? shareCia : null) ||
    bestCia?.key ||
    filledCias[0]?.key ||
    null;
  const activeCia = ciaRows.find((r) => r.key === activeCiaKey) || null;
  const shareModel = useMemo(() => {
    if (!activeCia || !cashPrice) return null;
    const searches = job?.searches || [];
    return {
      tripKind: job?.includeReturn ? "Ida e volta" : "Só ida",
      cashTotalCents: cashPrice,
      cashIda: toShareLeg(bestIda),
      cashVolta: job?.includeReturn ? toShareLeg(bestVolta) : null,
      ciaLabel: activeCia.label,
      milesTotalCents: activeCia.total,
      miles: activeCia.milesN,
      feeCents: activeCia.feeCents,
      milheiroCents: activeCia.milheiroCents,
      milesIda: milesShareLeg(
        searches,
        activeCia.key,
        "IDA",
        activeCia.label,
        toShareLeg(bestIda),
        job?.quoteCia?.[activeCia.key]
      ),
      milesVolta: job?.includeReturn
        ? milesShareLeg(
            searches,
            activeCia.key,
            "VOLTA",
            activeCia.label,
            toShareLeg(bestVolta),
            null
          )
        : null,
    };
  }, [activeCia, cashPrice, job, bestIda, bestVolta]);
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
        {
          miles: r.milesN,
          feeCents: r.feeCents,
          milheiroCents: r.milheiroCents,
          depTime: job.quoteCia?.[r.key]?.depTime,
          arrTime: job.quoteCia?.[r.key]?.arrTime,
        },
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
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
            <Plane className="h-5 w-5 text-slate-400" />
            Cotação
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">Google Flights no à vista. Extensão só nas milhas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold",
              extOk ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
            )}
          >
            {extOk ? "Extensão ok" : "Sem extensão"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={captureOn}
            disabled={!extOk}
            onClick={() => {
              const on = !captureOn;
              setCaptureOn(on);
              window.dispatchEvent(new CustomEvent("tm-cotacao-capture", { detail: { on } }));
            }}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold disabled:opacity-50",
              captureOn ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", captureOn ? "bg-emerald-500" : "bg-slate-300")} />
            Captura {captureOn ? "ligada" : "off"}
          </button>
          <a
            href={ZIP_HREF}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
            Extensão
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={FIELD}>Origem</label>
            <input
              value={origins}
              onChange={(e) => setOrigins(fmtIataField(e.target.value))}
              className={cn(INPUT, "uppercase")}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="GRU, CGH, VCP"
            />
          </div>
          <div>
            <label className={FIELD}>Destino</label>
            <input
              value={destinations}
              onChange={(e) => setDestinations(fmtIataField(e.target.value))}
              className={cn(INPUT, "uppercase")}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="SSA, REC"
            />
          </div>
          <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
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
                <label className={FIELD}>Ida</label>
                <input type="date" value={outboundFrom} onChange={(e) => setOutboundFrom(e.target.value)} className={INPUT} />
              </div>
              {tripKind === "rt" ? (
                <div>
                  <label className={FIELD}>Volta</label>
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
            </>
          )}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">Filtros opcionais</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={FIELD}>Duração máx. (h)</label>
              <input
                value={filterMaxHours}
                onChange={(e) => setFilterMaxHours(e.target.value)}
                className={INPUT}
                placeholder="2,5"
              />
            </div>
            <div>
              <label className={FIELD}>Sai a partir de</label>
              <input type="time" value={filterDepFrom} onChange={(e) => setFilterDepFrom(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>Sai até</label>
              <input type="time" value={filterDepTo} onChange={(e) => setFilterDepTo(e.target.value)} className={INPUT} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" checked={filterDirectOnly} onChange={(e) => setFilterDirectOnly(e.target.checked)} />
              Somente voos diretos
            </label>
          </div>
        </details>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {loading ? "Montando..." : "Buscar à vista"}
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
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">{startError}</div>
        ) : null}
        {extReload ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Recarregue a página (⌘R) e busque de novo — a extensão perdeu o contato.
          </div>
        ) : null}
        {job?.status === "RUNNING" ? (
          <p className="mt-3 text-sm text-slate-500">
            Google Flights {progress.done}/{progress.total}
            {cashPrice ? ` · ${cashLabel} ${fmtMoney(cashPrice)}` : ""}
          </p>
        ) : null}
      </div>

      {job ? (
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">À vista · Google Flights</div>
            <div className="text-sm font-semibold text-slate-900">
              {job.origins} → {job.destinations}
              {job.includeReturn ? " · ida e volta" : " · só ida"}
            </div>
          </div>
          {cashPrice > 0 ? (
            <>
              <CashFlightCard title={job.includeReturn ? "Ida" : "Menor tarifa"} row={bestIda} />
              {job.includeReturn ? <CashFlightCard title="Volta" row={bestVolta} /> : null}
              <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{cashLabel}</div>
                <div className="text-2xl font-bold tabular-nums">{fmtMoney(cashPrice)}</div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
              {job.status === "RUNNING"
                ? "Consultando o Google Flights…"
                : googleError || "Ainda sem tarifa à vista nesta busca."}
            </div>
          )}
          {shareModel ? (
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Para o cliente</div>
              <div className="overflow-hidden rounded-[28px] border border-slate-200 shadow-sm">
                <CotacaoShareCard model={shareModel} fluid />
              </div>
              <CotacaoShareActions model={shareModel} />
            </div>
          ) : cashPrice > 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Preencha milhas e taxa em uma cia para montar a proposta.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Números das cias</div>
            <p className="text-xs text-slate-500">
              {cashPrice
                ? `À vista de referência: ${fmtMoney(cashPrice)}. O milheiro fica ~5% abaixo, sem passar do mínimo em `
                : "Digite as milhas reais (o exemplo cinza não conta). O total do cliente aparece na hora. Mínimo em "}
              <Link href="/dashboard/configuracoes" className="font-semibold text-slate-800 underline">
                Configurações
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            onClick={saveQuote}
            disabled={!job}
            className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase text-slate-400">
              <tr>
                <th className="pb-2 pr-2">Cia</th>
                <th className="pb-2 pr-2">Milhas</th>
                <th className="pb-2 pr-2">Taxa</th>
                <th className="pb-2 pr-2">Milheiro</th>
                <th className="pb-2 pr-2">Cliente paga</th>
                <th className="pb-2">vs à vista</th>
              </tr>
            </thead>
            <tbody>
              {ciaRows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 align-top">
                  <td className="py-3 pr-2 font-semibold">
                    {r.label}
                    {bestCia?.key === r.key ? (
                      <div className="text-[10px] font-bold uppercase text-emerald-700">melhor</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-2">
                    <input
                      value={r.q.miles}
                      onChange={(e) => patchCia(r.key, { miles: e.target.value, milheiroManual: false })}
                      className="h-9 w-24 rounded-lg border border-slate-200 px-2"
                      placeholder="milhas"
                      inputMode="numeric"
                    />
                  </td>
                  <td className="py-3 pr-2">
                    <input
                      value={r.q.fee}
                      onChange={(e) => patchCia(r.key, { fee: e.target.value, milheiroManual: false })}
                      className="h-9 w-20 rounded-lg border border-slate-200 px-2"
                    />
                  </td>
                  <td className="py-3 pr-2">
                    <input
                      value={
                        r.q.milheiroManual
                          ? r.q.milheiro
                          : r.milesN > 0 && r.suggested
                            ? fromCents(r.suggested)
                            : ""
                      }
                      onChange={(e) => patchCia(r.key, { milheiro: e.target.value, milheiroManual: true })}
                      className="h-9 w-20 rounded-lg border border-slate-200 px-2"
                      placeholder={r.minCents ? fromCents(r.minCents) : "0,00"}
                    />
                    <div className="mt-1 text-[10px] text-slate-400">
                      mín {r.minCents ? fmtMoney(r.minCents) : "—"}
                      {r.q.milheiroManual ? (
                        <button
                          type="button"
                          className="ml-1 underline"
                          onClick={() => patchCia(r.key, { milheiroManual: false, milheiro: "" })}
                        >
                          auto
                        </button>
                      ) : null}
                    </div>
                    {r.belowMin ? <div className="text-[10px] font-semibold text-amber-800">abaixo do mínimo</div> : null}
                  </td>
                  <td className="py-3 pr-2 font-semibold tabular-nums">
                    {r.milesN > 0 && r.milheiroCents > 0 ? fmtMoney(r.total) : "—"}
                  </td>
                  <td
                    className={cn(
                      "py-3 text-xs font-semibold tabular-nums",
                      r.discount > 0 ? "text-emerald-700" : r.discount < 0 ? "text-rose-700" : "text-slate-400"
                    )}
                  >
                    {r.milesN > 0 && r.milheiroCents > 0 && cashPrice
                      ? r.discount >= 0
                        ? `− ${fmtMoney(r.discount)} (${r.discountPct}%)`
                        : `+ ${fmtMoney(Math.abs(r.discount))}`
                      : r.milesN > 0 && r.milheiroCents > 0
                        ? "sem à vista"
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {job?.searches?.length ? (
        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-800">
            Pesquisas
            <span className="ml-2 text-xs font-normal text-slate-500">
              {progress.done}/{progress.total}
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
                  <td className="p-3">{dateBr(s.date)}</td>
                  <td className="p-3">{s.airline === "Google" ? "Google Flights" : s.airline || "—"}</td>
                  <td className="p-3 text-xs text-slate-600">{fmtFlightSchedule(s) || "—"}</td>
                  <td className="p-3 tabular-nums">
                    {s.miles ? `${fmtMiles(s.miles)} milhas` : s.priceCents ? fmtMoney(s.priceCents) : "—"}
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

function milesHref(key: CiaKey, origin: string, dest: string, date: string) {
  if (key === "latam") return buildLatamSearchUrl(origin, dest, date);
  if (key === "smiles") return buildSmilesSearchUrl(origin, dest, date, 1);
  return buildAzulSearchUrl(origin, dest, date);
}

function CashFlightCard({ title, row }: { title: string; row: SearchRow | null }) {
  if (!row) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        {title}: ainda sem voo.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">
        {row.originIata} → {row.destIata}
      </div>
      <div className="text-sm text-slate-600">
        {dateBr(row.date)}
        {row.rawPrice ? ` · ${row.rawPrice}` : ""}
      </div>
      {fmtFlightSchedule(row) ? (
        <div className="mt-1 text-sm font-medium text-slate-800">{fmtFlightSchedule(row)}</div>
      ) : null}
      <div className="mt-1 text-xl font-bold tabular-nums">{fmtMoney(row.priceCents)}</div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Buscar milhas deste trecho
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {row.url ? (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700"
            >
              Google <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {CIA_META.map(({ key, label }) => {
            const href = milesHref(key, row.originIata, row.destIata, row.date);
            if (!href) return null;
            return (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800"
              >
                {label}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
