"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, Eraser, ExternalLink, Plane, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  buildAzulSearchUrl,
  buildLatamSearchUrl,
  buildSmilesSearchUrl,
  cashAirlineSearches,
  cashSiteDisplayName,
  ciaKeyFromMilesAirline,
  fmtFlightSchedule,
  isCashAirline,
  isMilesAirline,
  isScoutAirline,
  pickPreferredCashSearch,
  durationMinFromClocks,
  parseClock,
  resolvedDurationMin,
  saleTotalCents,
  suggestedMilheiroCents,
} from "@/lib/cotacao-passagens";
import { CotacaoShareActions, CotacaoShareCard, type ShareLeg } from "./CotacaoShareCard";
import { quoteLeg, type QuoteCiaCell } from "@/lib/cotacao-quote-cia";
import { priceMixedQuote, rankLegCost } from "@/lib/cotacao-mix";

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
  updatedAt?: string | Date | null;
};

type Job = {
  id: string;
  status: string;
  origins: string;
  destinations: string;
  adults?: number;
  includeReturn: boolean;
  quoteMiles: number;
  quoteMilheiroCents: number;
  quoteBoardingFeeCents: number;
  quoteCia?: Record<string, QuoteCiaCell> | null;
  filterMaxDurationMin?: number | null;
  filterDepFrom?: string | null;
  filterDepTo?: string | null;
  filterDirectOnly?: boolean;
  searches: SearchRow[];
};

type CiaKey = "latam" | "smiles" | "azul";
type CiaDraft = {
  idaMiles: string;
  idaFee: string;
  voltaMiles: string;
  voltaFee: string;
  milheiro: string;
  milheiroManual: boolean;
};

const CIA_META: { key: CiaKey; label: string }[] = [
  { key: "latam", label: "LATAM" },
  { key: "smiles", label: "Smiles" },
  { key: "azul", label: "Azul" },
];

function emptyCia(): CiaDraft {
  return { idaMiles: "", idaFee: "0,00", voltaMiles: "", voltaFee: "0,00", milheiro: "", milheiroManual: false };
}
function fromSaved(row?: QuoteCiaCell | null): CiaDraft {
  if (!row) return emptyCia();
  const ida = quoteLeg(row, "IDA");
  const volta = quoteLeg(row, "VOLTA");
  return {
    idaMiles: ida.miles ? String(ida.miles) : "",
    idaFee: ida.feeCents ? fromCents(ida.feeCents) : "0,00",
    voltaMiles: volta.miles ? String(volta.miles) : "",
    voltaFee: volta.feeCents ? fromCents(volta.feeCents) : "0,00",
    milheiro: row.milheiroCents ? fromCents(row.milheiroCents) : "",
    milheiroManual: Boolean(row.milheiroCents),
  };
}

const ZIP_HREF = "/downloads/trademiles-cotacao-gol-extension.zip?v=1.8.14";
let leaveClearTimer: number | null = null;
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
  const quoteDep = parseClock(quote?.depTime || "");
  const quoteArr = parseClock(quote?.arrTime || "");
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
  const [mixAdvice, setMixAdvice] = useState("");
  const [minMilheiro, setMinMilheiro] = useState<Record<CiaKey, number>>({
    latam: 0,
    smiles: 0,
    azul: 0,
  });
  const jobIdRef = useRef<string>("");
  jobIdRef.current = job?.id || "";

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
    const sendClear = (id: string) => {
      if (!id) return;
      void fetch(`/api/cotacao-passagens/${encodeURIComponent(id)}`, {
        method: "PATCH",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearQuote: true }),
      });
    };
    if (leaveClearTimer) {
      window.clearTimeout(leaveClearTimer);
      leaveClearTimer = null;
    }
    const onHide = () => sendClear(jobIdRef.current);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      const id = jobIdRef.current;
      leaveClearTimer = window.setTimeout(() => {
        leaveClearTimer = null;
        sendClear(id);
      }, 400);
    };
  }, []);

  useEffect(() => {
    const src = job?.quoteCia;
    if (!src || !job?.id) return;
    setCiaQuotes((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of ["latam", "smiles", "azul"] as CiaKey[]) {
        const row = src[key];
        if (!row) continue;
        const saved = fromSaved(row);
        const cur = next[key];
        if (
          cur.idaMiles === saved.idaMiles &&
          cur.idaFee === saved.idaFee &&
          cur.voltaMiles === saved.voltaMiles &&
          cur.voltaFee === saved.voltaFee
        ) {
          continue;
        }
        next[key] = { ...saved, milheiro: cur.milheiroManual ? cur.milheiro : saved.milheiro, milheiroManual: cur.milheiroManual };
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
        if (s.direction === "VOLTA") {
          if (toMiles(next[key].voltaMiles) === s.miles) continue;
          next[key] = { ...next[key], voltaMiles: String(s.miles), milheiroManual: false };
        } else {
          if (toMiles(next[key].idaMiles) === s.miles) continue;
          next[key] = { ...next[key], idaMiles: String(s.miles), milheiroManual: false };
        }
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [job?.searches]);

  const bestIda = useMemo(() => pickPreferredCashSearch(job?.searches || [], "IDA"), [job]);
  const bestVolta = useMemo(() => pickPreferredCashSearch(job?.searches || [], "VOLTA"), [job]);
  const scoutIda = useMemo(
    () => (job?.searches || []).find((s) => s.direction === "IDA" && isScoutAirline(s.airline)) || null,
    [job]
  );
  const scoutVolta = useMemo(
    () => (job?.searches || []).find((s) => s.direction === "VOLTA" && isScoutAirline(s.airline)) || null,
    [job]
  );

  const comboCents = job?.includeReturn ? (bestIda?.priceCents || 0) + (bestVolta?.priceCents || 0) : 0;
  const cashPrice = comboCents > 0 ? comboCents : bestIda?.priceCents || 0;
  const cashSiteLabel = (() => {
    const names = [bestIda, job?.includeReturn ? bestVolta : null]
      .filter(Boolean)
      .map((row) => cashSiteDisplayName(row!.airline));
    return [...new Set(names)].join(" + ") || "Google Flights";
  })();
  const cashLabel = comboCents > 0 ? `À vista (ida + volta) · ${cashSiteLabel}` : bestIda ? `À vista · ${cashSiteLabel}` : "À vista";
  const googleError = (job?.searches || []).find(
    (s) => isScoutAirline(s.airline) && s.status === "ERRO" && s.error
  )?.error || "";

  const rt = Boolean(job?.includeReturn);
  const ciaRows = useMemo(() => {
    return CIA_META.map(({ key, label }) => {
      const q = ciaQuotes[key];
      const idaMiles = toMiles(q.idaMiles);
      const voltaMiles = rt ? toMiles(q.voltaMiles) : 0;
      const idaFee = toCents(q.idaFee);
      const voltaFee = rt ? toCents(q.voltaFee) : 0;
      const milesN = idaMiles + voltaMiles;
      const feeCents = idaFee + voltaFee;
      const ready = rt ? idaMiles > 0 && voltaMiles > 0 : idaMiles > 0;
      const minCents = minMilheiro[key] || 0;
      const fromCash = ready ? suggestedMilheiroCents(cashPrice, milesN, feeCents) : 0;
      const suggested = ready ? Math.max(fromCash, minCents) : 0;
      const milheiroCents = ready ? (q.milheiroManual ? toCents(q.milheiro) : suggested) : 0;
      const chargedOrTyped = q.milheiroManual ? toCents(q.milheiro) : milheiroCents;
      const total = ready && milheiroCents > 0 ? saleTotalCents(milesN, milheiroCents, feeCents) : 0;
      const idaTotal = ready && milheiroCents > 0 ? saleTotalCents(idaMiles, milheiroCents, idaFee) : 0;
      const voltaTotal = ready && milheiroCents > 0 ? saleTotalCents(voltaMiles, milheiroCents, voltaFee) : 0;
      const discount = cashPrice > 0 && total > 0 ? cashPrice - total : 0;
      const discountPct = cashPrice > 0 && total > 0 ? Math.round((discount / cashPrice) * 1000) / 10 : 0;
      const belowMin = minCents > 0 && chargedOrTyped > 0 && chargedOrTyped < minCents;
      const meetsMin = minCents <= 0 || milheiroCents >= minCents;
      const usedFloor = minCents > 0 && suggested === minCents && fromCash > 0 && fromCash < minCents;
      const saved = job?.quoteCia?.[key];
      return {
        key,
        label,
        idaMiles,
        voltaMiles,
        idaFee,
        voltaFee,
        milesN,
        feeCents,
        ready,
        minCents,
        suggested,
        milheiroCents,
        total,
        idaTotal,
        voltaTotal,
        discount,
        discountPct,
        belowMin,
        meetsMin,
        usedFloor,
        idaTimes: quoteLeg(saved, "IDA"),
        voltaTimes: quoteLeg(saved, "VOLTA"),
        q,
      };
    });
  }, [ciaQuotes, cashPrice, minMilheiro, rt, job?.quoteCia]);

  const filledCias = ciaRows.filter((r) => r.ready && r.total > 0);
  const viableCias = filledCias.filter((r) => r.meetsMin);
  const bestCia = viableCias.length
    ? viableCias.reduce((a, b) => (a.total <= b.total ? a : b))
    : null;
  const activeCiaKey: CiaKey | null =
    (shareCia && filledCias.some((r) => r.key === shareCia) ? shareCia : null) ||
    bestCia?.key ||
    filledCias[0]?.key ||
    null;
  const bestIdaCia = ciaRows
    .filter((r) => r.idaMiles > 0)
    .reduce<(typeof ciaRows)[number] | null>((a, b) => {
      const ca = rankLegCost(a?.idaMiles || 0, a?.idaFee || 0, a?.minCents || 0);
      const cb = rankLegCost(b.idaMiles, b.idaFee, b.minCents);
      return !a || cb < ca ? b : a;
    }, null);
  const bestVoltaCia = ciaRows
    .filter((r) => r.voltaMiles > 0)
    .reduce<(typeof ciaRows)[number] | null>((a, b) => {
      const ca = rankLegCost(a?.voltaMiles || 0, a?.voltaFee || 0, a?.minCents || 0);
      const cb = rankLegCost(b.voltaMiles, b.voltaFee, b.minCents);
      return !a || cb < ca ? b : a;
    }, null);
  const milheiroOverrides = useMemo(() => {
    const o: Record<string, number> = {};
    for (const key of ["latam", "smiles", "azul"] as CiaKey[]) {
      const q = ciaQuotes[key];
      if (!q.milheiroManual) continue;
      const cents = toCents(q.milheiro);
      if (cents > 0) o[key] = cents;
    }
    return o;
  }, [ciaQuotes]);
  const mix = useMemo(() => {
    if (!bestIdaCia?.idaMiles) return null;
    if (rt && !bestVoltaCia?.voltaMiles) return null;
    const priced = priceMixedQuote(
      cashPrice,
      {
        key: bestIdaCia.key,
        label: bestIdaCia.label,
        miles: bestIdaCia.idaMiles,
        feeCents: bestIdaCia.idaFee,
        minMilheiroCents: bestIdaCia.minCents,
      },
      rt && bestVoltaCia
        ? {
            key: bestVoltaCia.key,
            label: bestVoltaCia.label,
            miles: bestVoltaCia.voltaMiles,
            feeCents: bestVoltaCia.voltaFee,
            minMilheiroCents: bestVoltaCia.minCents,
          }
        : null,
      milheiroOverrides
    );
    return { priced, ida: bestIdaCia, volta: rt ? bestVoltaCia : null };
  }, [bestIdaCia, bestVoltaCia, cashPrice, rt, milheiroOverrides]);
  const activeCia = ciaRows.find((r) => r.key === activeCiaKey) || null;
  const shareModel = useMemo(() => {
    if (!cashPrice) return null;
    const searches = job?.searches || [];
    if (mix) {
      const idaKey = mix.ida.key;
      const voltaKey = mix.volta?.key || mix.ida.key;
      const milheiroLabel =
        mix.volta && mix.priced.idaRate !== mix.priced.voltaRate
          ? `milheiro ${mix.ida.label} ${fmtMoney(mix.priced.idaRate)} · ${mix.volta.label} ${fmtMoney(mix.priced.voltaRate)}`
          : `milheiro ${fmtMoney(mix.priced.idaRate)}`;
      return {
        tripKind: job?.includeReturn ? "Ida e volta" : "Só ida",
        cashTotalCents: cashPrice,
        cashSiteLabel,
        cashIda: toShareLeg(bestIda),
        cashVolta: job?.includeReturn ? toShareLeg(bestVolta) : null,
        ciaLabel: mix.priced.ciaLabel,
        milesTotalCents: mix.priced.total,
        miles: mix.priced.miles,
        feeCents: mix.priced.feeCents,
        milheiroCents: mix.priced.idaRate,
        milheiroLabel,
        milesIda: milesShareLeg(
          searches,
          idaKey,
          "IDA",
          mix.ida.label,
          toShareLeg(bestIda),
          quoteLeg(job?.quoteCia?.[idaKey], "IDA")
        ),
        milesVolta: job?.includeReturn
          ? milesShareLeg(
              searches,
              voltaKey,
              "VOLTA",
              mix.volta?.label || mix.ida.label,
              toShareLeg(bestVolta),
              quoteLeg(job?.quoteCia?.[voltaKey], "VOLTA")
            )
          : null,
      };
    }
    if (!activeCia?.ready) return null;
    return {
      tripKind: job?.includeReturn ? "Ida e volta" : "Só ida",
      cashTotalCents: cashPrice,
      cashSiteLabel,
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
        quoteLeg(job?.quoteCia?.[activeCia.key], "IDA")
      ),
      milesVolta: job?.includeReturn
        ? milesShareLeg(
            searches,
            activeCia.key,
            "VOLTA",
            activeCia.label,
            toShareLeg(bestVolta),
            quoteLeg(job?.quoteCia?.[activeCia.key], "VOLTA")
          )
        : null,
    };
  }, [activeCia, cashPrice, cashSiteLabel, job, bestIda, bestVolta, mix]);
  useEffect(() => {
    const volta = mix?.volta;
    if (!mix?.priced.missesTarget || !volta) {
      setMixAdvice("");
      return;
    }
    let stop = false;
    void (async () => {
      const r = await fetch("/api/cotacao-passagens/mix-advice", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashCents: cashPrice,
          targetCents: mix.priced.targetCents,
          floorTotalCents: mix.priced.floorTotal,
          idaLabel: mix.ida.label,
          idaMiles: mix.ida.idaMiles,
          idaMinMilheiroCents: mix.ida.minCents,
          voltaLabel: volta.label,
          voltaMiles: volta.voltaMiles,
          voltaMinMilheiroCents: volta.minCents,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!stop) setMixAdvice(String(j?.note || ""));
    })();
    return () => {
      stop = true;
    };
  }, [mix, cashPrice]);
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

  async function clearQuoteData() {
    setCiaQuotes({ latam: emptyCia(), smiles: emptyCia(), azul: emptyCia() });
    setMixAdvice("");
    setShareCia(null);
    setJob(null);
    const id = jobIdRef.current || job?.id;
    if (!id) return;
    await fetch(`/api/cotacao-passagens/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearQuote: true }),
    }).catch(() => null);
  }

  async function dropCashCia(direction: "IDA" | "VOLTA") {
    if (!job) return;
    const r = await fetch(`/api/cotacao-passagens/${encodeURIComponent(job.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropCashCia: true, direction }),
    });
    const j = await r.json().catch(() => null);
    if (j?.job) setJob(j.job);
    else load(job.id);
  }

  async function saveQuote() {
    if (!job) return;
    const quoteCia = Object.fromEntries(
      ciaRows.map((r) => [
        r.key,
        {
          milheiroCents: r.milheiroCents,
          ida: {
            miles: r.idaMiles,
            feeCents: r.idaFee,
            depTime: quoteLeg(job.quoteCia?.[r.key], "IDA").depTime,
            arrTime: quoteLeg(job.quoteCia?.[r.key], "IDA").arrTime,
          },
          volta: {
            miles: r.voltaMiles,
            feeCents: r.voltaFee,
            depTime: quoteLeg(job.quoteCia?.[r.key], "VOLTA").depTime,
            arrTime: quoteLeg(job.quoteCia?.[r.key], "VOLTA").arrTime,
          },
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

  // Trecho de cada sentido (para abrir a busca em milhas já com origem, destino e data).
  const idaRoute = bestIda || (job?.searches || []).find((x) => x.direction !== "VOLTA") || null;
  const voltaRoute = bestVolta || (job?.searches || []).find((x) => x.direction === "VOLTA") || null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Plane className="h-6 w-6 text-slate-400" />
            Cotação de passagens
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Em 4 passos: busque o preço à vista, veja quantas milhas custa em cada cia, confira quanto o cliente paga e
            mande a proposta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold",
              extOk ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
            )}
            title="A extensão de cotação faz a busca no Google Flights e lê as milhas nos sites das cias."
          >
            {extOk ? "Extensão de cotação ok" : "Extensão de cotação não detectada"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={captureOn}
            disabled={!extOk}
            title="Ligada: ao abrir a busca na LATAM, Smiles ou Azul, as milhas do voo escolhido entram sozinhas no passo 3. Desliga sozinha após 10 min sem usar."
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
            Ler milhas sozinho: {captureOn ? "ligado" : "desligado"}
          </button>
          <a
            href={ZIP_HREF}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-700"
            title="Instale no Chrome: descompacte, chrome://extensions, Modo do desenvolvedor, Carregar sem compactação."
          >
            <Download className="h-3.5 w-3.5" />
            Baixar extensão
          </a>
        </div>
      </div>

      {/* PASSO 1 */}
      <StepCard n={1} title="Para onde e quando?" hint="Use o código de 3 letras dos aeroportos. Pode colocar vários, separados por vírgula: o sistema pega o mais barato.">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={FIELD}>Saindo de</label>
            <input
              value={origins}
              onChange={(e) => setOrigins(fmtIataField(e.target.value))}
              className={cn(INPUT, "uppercase")}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Ex.: GRU, CGH, VCP"
            />
            <p className="mt-1 text-[11px] text-slate-400">São Paulo = GRU, CGH, VCP · Rio = GIG, SDU · Recife = REC</p>
          </div>
          <div>
            <label className={FIELD}>Indo para</label>
            <input
              value={destinations}
              onChange={(e) => setDestinations(fmtIataField(e.target.value))}
              className={cn(INPUT, "uppercase")}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Ex.: SSA, REC"
            />
            <p className="mt-1 text-[11px] text-slate-400">João Pessoa = JPA · Salvador = SSA · Fortaleza = FOR</p>
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
                { id: "exact", label: "Data certa" },
                { id: "range", label: "Entre datas (mais barato)" },
              ]}
            />
          </div>
          {dateKind === "exact" ? (
            <>
              <div className={tripKind === "ow" ? "md:col-span-2" : ""}>
                <label className={FIELD}>Data da ida</label>
                <input type="date" value={outboundFrom} onChange={(e) => setOutboundFrom(e.target.value)} className={INPUT} />
              </div>
              {tripKind === "rt" ? (
                <div>
                  <label className={FIELD}>Data da volta</label>
                  <input type="date" value={returnFrom} onChange={(e) => setReturnFrom(e.target.value)} className={INPUT} />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div>
                <label className={FIELD}>Ida a partir de</label>
                <input type="date" value={outboundFrom} onChange={(e) => setOutboundFrom(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label className={FIELD}>Ida até</label>
                <input type="date" value={outboundTo} onChange={(e) => setOutboundTo(e.target.value)} className={INPUT} />
              </div>
              {tripKind === "rt" ? (
                <>
                  <div>
                    <label className={FIELD}>Volta a partir de</label>
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
          <summary className="cursor-pointer text-xs font-semibold text-slate-500">
            Preferências do cliente (opcional): horário, duração, só voo direto
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={FIELD}>Duração máxima (horas)</label>
              <input
                value={filterMaxHours}
                onChange={(e) => setFilterMaxHours(e.target.value)}
                className={INPUT}
                placeholder="Ex.: 2,5"
              />
            </div>
            <div>
              <label className={FIELD}>Sair a partir de</label>
              <input type="time" value={filterDepFrom} onChange={(e) => setFilterDepFrom(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>Sair até</label>
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
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {loading ? "Montando..." : "Buscar preço à vista"}
          </button>
          {job?.status === "RUNNING" ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-800"
            >
              <Square className="h-3.5 w-3.5" />
              Parar
            </button>
          ) : null}
          {job ? (
            <button
              type="button"
              onClick={() => void clearQuoteData()}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <Eraser className="h-4 w-4" />
              Começar outra cotação
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
      </StepCard>

      {/* PASSO 2 */}
      <StepCard
        n={2}
        title="Preço à vista"
        hint="É quanto o cliente pagaria comprando direto. Serve de referência: a proposta em milhas precisa sair mais barata."
        muted={!job}
      >
        {!job ? (
          <p className="text-sm text-slate-500">Faça a busca do passo 1.</p>
        ) : cashPrice > 0 ? (
          <div className="space-y-3">
            <div className={cn("grid gap-3", job.includeReturn && "md:grid-cols-2")}>
              <CashFlightCard
                title={job.includeReturn ? "Ida" : "Menor tarifa"}
                row={bestIda}
                adults={job.adults || 1}
                scoutUrl={scoutIda?.url || ""}
                onUseGoogle={isCashAirline(bestIda?.airline || "") ? () => dropCashCia("IDA") : undefined}
              />
              {job.includeReturn ? (
                <CashFlightCard
                  title="Volta"
                  row={bestVolta}
                  adults={job.adults || 1}
                  scoutUrl={scoutVolta?.url || ""}
                  onUseGoogle={isCashAirline(bestVolta?.airline || "") ? () => dropCashCia("VOLTA") : undefined}
                />
              ) : null}
            </div>
            <div className="rounded-2xl bg-slate-900 px-4 py-3 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{cashLabel}</div>
              <div className="text-2xl font-bold tabular-nums">{fmtMoney(cashPrice)}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {job.status === "RUNNING"
              ? `Consultando o Google Flights… (${progress.done}/${progress.total})`
              : googleError || "Ainda sem tarifa à vista nesta busca."}
          </p>
        )}
      </StepCard>

      {/* PASSO 3 */}
      <StepCard
        n={3}
        title="Milhas nas cias"
        hint={
          rt
            ? "Para cada cia: abra a busca da ida e da volta, escolha o voo e copie aqui as milhas e a taxa. Com “Ler milhas sozinho” ligado, elas entram automaticamente. Pode misturar cias: o sistema junta a melhor ida com a melhor volta."
            : "Para cada cia: abra a busca, escolha o voo e copie aqui as milhas e a taxa. Com “Ler milhas sozinho” ligado, elas entram automaticamente."
        }
        muted={!job}
        action={
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={saveQuote}
              disabled={!job}
              className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        }
      >
        <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-950">
          <b>Milheiro</b> é quanto cobramos por cada 1.000 milhas. O sistema já sugere um valor que deixa a proposta
          ~5% abaixo do à vista, sem passar do <b>mínimo da cia</b> (definido em{" "}
          <Link href="/dashboard/configuracoes" className="font-semibold underline">
            Configurações
          </Link>
          ). Conta: <b>milhas ÷ 1.000 × milheiro + taxa = quanto o cliente paga</b>.
        </div>

        {mix ? (
          <div
            className={cn(
              "mb-3 rounded-xl border px-3 py-3 text-sm",
              cashPrice && mix.priced.total > cashPrice
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            )}
          >
            <div className="font-semibold">
              Melhor opção: {mix.priced.ciaLabel} · cliente paga {fmtMoney(mix.priced.total)}
              {cashPrice
                ? mix.priced.total <= cashPrice
                  ? ` · ${Math.round(((cashPrice - mix.priced.total) / cashPrice) * 1000) / 10}% mais barato que o à vista`
                  : ` · ${fmtMoney(mix.priced.total - cashPrice)} mais caro que o à vista`
                : ""}
            </div>
            <p className="mt-0.5 text-xs opacity-80">
              Ida {mix.ida.label}: {fmtMiles(mix.ida.idaMiles)} milhas a {fmtMoney(mix.priced.idaRate)} o milheiro
              {mix.volta
                ? ` · Volta ${mix.volta.label}: ${fmtMiles(mix.volta.voltaMiles)} milhas a ${fmtMoney(mix.priced.voltaRate)} o milheiro`
                : ""}
              {mix.priced.usedFloor ? " · já no mínimo das cias" : ""}
            </p>
            {cashPrice && mix.priced.total > cashPrice ? (
              <p className="mt-1 text-xs font-semibold">
                Mesmo no mínimo, com milhas fica mais caro que comprar à vista. Melhor não emitir com milhas nesse caso.
              </p>
            ) : null}
            {mixAdvice ? <p className="mt-1 text-xs">{mixAdvice}</p> : null}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3">
          {ciaRows.map((r) => {
            const mixPay =
              (mix?.ida.key === r.key ? mix.priced.idaTotal : 0) + (mix?.volta?.key === r.key ? mix.priced.voltaTotal : 0);
            const pays = r.ready && r.milheiroCents > 0 ? r.total : mixPay;
            const milheiroShown = r.q.milheiroManual
              ? r.q.milheiro
              : mix?.ida.key === r.key
                ? fromCents(mix.priced.idaRate)
                : mix?.volta?.key === r.key
                  ? fromCents(mix.priced.voltaRate)
                  : r.ready && r.suggested
                    ? fromCents(r.suggested)
                    : r.milesN && r.minCents
                      ? fromCents(r.minCents)
                      : "";
            const legs: { dir: "IDA" | "VOLTA"; label: string; route: SearchRow | null }[] = [
              { dir: "IDA", label: "Ida", route: idaRoute },
              ...(rt ? [{ dir: "VOLTA" as const, label: "Volta", route: voltaRoute }] : []),
            ];
            return (
              <div
                key={r.key}
                className={cn(
                  "rounded-2xl border p-4",
                  bestCia?.key === r.key ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-bold text-slate-900">{r.label}</div>
                  {bestCia?.key === r.key ? (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                      melhor
                    </span>
                  ) : null}
                </div>

                {legs.map((leg) => {
                  const isIda = leg.dir === "IDA";
                  const href = leg.route ? milesHref(r.key, leg.route.originIata, leg.route.destIata, leg.route.date) : "";
                  const times = isIda ? r.idaTimes : r.voltaTimes;
                  const best = isIda ? bestIdaCia?.key === r.key && r.idaMiles : bestVoltaCia?.key === r.key && r.voltaMiles;
                  return (
                    <div key={leg.dir} className="mt-3 rounded-xl border border-slate-100 bg-white p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">
                          {leg.label}
                          {leg.route ? (
                            <span className="ml-1 font-normal text-slate-400">
                              {leg.route.originIata} → {leg.route.destIata} · {dateBr(leg.route.date)}
                            </span>
                          ) : null}
                        </span>
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2 text-[11px] font-semibold text-white hover:bg-slate-800"
                          >
                            Abrir busca <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase text-slate-400">Milhas</span>
                          <input
                            value={isIda ? r.q.idaMiles : r.q.voltaMiles}
                            onChange={(e) =>
                              patchCia(r.key, isIda ? { idaMiles: e.target.value, milheiroManual: false } : { voltaMiles: e.target.value, milheiroManual: false })
                            }
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                            placeholder="Ex.: 60200"
                            inputMode="numeric"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-semibold uppercase text-slate-400">Taxa (R$)</span>
                          <input
                            value={isIda ? r.q.idaFee : r.q.voltaFee}
                            onChange={(e) =>
                              patchCia(r.key, isIda ? { idaFee: e.target.value, milheiroManual: false } : { voltaFee: e.target.value, milheiroManual: false })
                            }
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
                            placeholder="Ex.: 35,00"
                          />
                        </label>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {times.depTime && times.arrTime ? `Voo ${times.depTime} → ${times.arrTime}` : ""}
                        {best ? <span className="ml-1 font-bold uppercase text-emerald-700">melhor {leg.label.toLowerCase()}</span> : null}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-3 border-t border-slate-100 pt-3">
                  <div className="flex items-end justify-between gap-2">
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Milheiro (R$ por mil)</span>
                      <input
                        value={milheiroShown}
                        onChange={(e) => patchCia(r.key, { milheiro: e.target.value, milheiroManual: true })}
                        className="mt-0.5 h-9 w-24 rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50"
                        placeholder={r.minCents ? fromCents(r.minCents) : "0,00"}
                        disabled={!r.milesN}
                      />
                    </label>
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase text-slate-400">Cliente paga</div>
                      <div className="text-lg font-bold tabular-nums text-slate-900">{pays > 0 ? fmtMoney(pays) : "—"}</div>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {r.milesN ? (
                      <>
                        {fmtMiles(r.milesN)} milhas + taxa {fmtMoney(r.feeCents)} · mínimo da cia{" "}
                        {r.minCents ? fmtMoney(r.minCents) : "—"}
                        {r.q.milheiroManual ? (
                          <button
                            type="button"
                            className="ml-1 font-semibold underline"
                            onClick={() => patchCia(r.key, { milheiroManual: false, milheiro: "" })}
                          >
                            voltar ao sugerido
                          </button>
                        ) : (
                          " · sugerido automático"
                        )}
                      </>
                    ) : (
                      "Preencha as milhas para calcular."
                    )}
                  </div>
                  {rt && r.milesN && !r.ready ? (
                    <div className="mt-1 text-[11px] font-semibold text-amber-800">Falta {r.idaMiles ? "a volta" : "a ida"} nesta cia.</div>
                  ) : null}
                  {r.belowMin ? (
                    <div className="mt-1 text-[11px] font-semibold text-amber-800">Abaixo do mínimo da cia.</div>
                  ) : null}
                  {r.ready && r.milheiroCents > 0 && cashPrice ? (
                    <div
                      className={cn(
                        "mt-1 text-[11px] font-semibold",
                        r.discount >= 0 ? "text-emerald-700" : "text-rose-700"
                      )}
                    >
                      {r.discount >= 0
                        ? `${fmtMoney(r.discount)} mais barato que o à vista (${r.discountPct}%)`
                        : `${fmtMoney(Math.abs(r.discount))} mais caro que o à vista`}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </StepCard>

      {/* PASSO 4 */}
      <StepCard
        n={4}
        title="Proposta para o cliente"
        hint="Copie a imagem e mande no Telegram do cliente. Ela compara o à vista com a nossa proposta."
        muted={!shareModel}
      >
        {shareModel ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-[28px] border border-slate-200 shadow-sm">
              <CotacaoShareCard model={shareModel} fluid />
            </div>
            <CotacaoShareActions model={shareModel} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {!job
              ? "Aparece depois da busca e das milhas."
              : !cashPrice
                ? "Precisa do preço à vista (passo 2)."
                : rt
                  ? "Preencha milhas e taxa da ida e da volta em pelo menos uma cia (passo 3)."
                  : "Preencha milhas e taxa em pelo menos uma cia (passo 3)."}
          </p>
        )}
      </StepCard>

      {job?.searches?.length ? (
        <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-800">
            Detalhes das buscas
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

function StepCard({
  n,
  title,
  hint,
  muted,
  action,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  muted?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-slate-200 bg-white p-4 sm:p-5", muted && "opacity-70")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            {n}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function milesHref(key: CiaKey, origin: string, dest: string, date: string) {
  if (key === "latam") return buildLatamSearchUrl(origin, dest, date);
  if (key === "smiles") return buildSmilesSearchUrl(origin, dest, date, 1);
  return buildAzulSearchUrl(origin, dest, date);
}

function CashFlightCard({
  title,
  row,
  adults = 1,
  scoutUrl,
  onUseGoogle,
}: {
  title: string;
  row: SearchRow | null;
  adults?: number;
  scoutUrl?: string;
  onUseGoogle?: () => void;
}) {
  if (!row) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        {title}: ainda sem voo.
      </div>
    );
  }
  const googleHref = isScoutAirline(row.airline) ? row.url : scoutUrl || row.url;
  const cashLinks = cashAirlineSearches(row.originIata, row.destIata, row.date, adults);
  const usingCia = isCashAirline(row.airline);
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
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="text-xl font-bold tabular-nums">{fmtMoney(row.priceCents)}</div>
        <div className="text-xs font-semibold text-slate-500">{cashSiteDisplayName(row.airline)}</div>
        {usingCia && onUseGoogle ? (
          <button
            type="button"
            onClick={onUseGoogle}
            className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Usar Google Flights
          </button>
        ) : null}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Conferir o à vista direto na cia
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {cashLinks.map((cia) => (
            <a
              key={cia.airline}
              href={cia.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-800"
            >
              {cashSiteDisplayName(cia.airline)}
            </a>
          ))}
        </div>
      </div>
      {googleHref ? (
        <a
          href={googleHref}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          Ver no Google Flights <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
