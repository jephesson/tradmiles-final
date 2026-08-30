"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plane, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  buildAzulSearchUrl,
  buildLatamSearchUrl,
  buildSmilesSearchUrl,
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
  airline: string;
  error: string | null;
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

const ZIP_HREF = "/downloads/trademiles-cotacao-123-extension.zip";
const FIELD = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const INPUT =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10";

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
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" }).format(new Date());
}

export default function CotacaoPassagensClient() {
  const [origins, setOrigins] = useState("GRU, CGH, VCP");
  const [destinations, setDestinations] = useState("");
  const [outboundFrom, setOutboundFrom] = useState(todayISO);
  const [outboundTo, setOutboundTo] = useState("");
  const [outboundDays, setOutboundDays] = useState("7");
  const [includeReturn, setIncludeReturn] = useState(true);
  const [returnExact, setReturnExact] = useState(false);
  const [returnFrom, setReturnFrom] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [returnDays, setReturnDays] = useState("7");
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [extOn, setExtOn] = useState(false);
  const [ciaQuotes, setCiaQuotes] = useState<Record<CiaKey, CiaDraft>>({
    latam: emptyCia(),
    smiles: emptyCia(),
    azul: emptyCia(),
  });
  const [hydratedJobId, setHydratedJobId] = useState("");

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
    if (typeof document === "undefined") return;
    document.body.dataset.tmCotacaoJob = job?.status === "RUNNING" && job.id ? job.id : "";
    const sync = () => {
      if (document.documentElement.dataset.tmCotacaoExt) setExtOn(true);
    };
    const onBridge = (e: Event) => {
      const connected = Boolean((e as CustomEvent<{ connected?: boolean }>).detail?.connected);
      if (connected) setExtOn(true);
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
    if (!job?.id || job.id === hydratedJobId) return;
    const src = job.quoteCia || {};
    setCiaQuotes({
      latam: fromSaved(src.latam),
      smiles: fromSaved(src.smiles),
      azul: fromSaved(src.azul),
    });
    setHydratedJobId(job.id);
  }, [job?.id, hydratedJobId, job?.quoteCia]);

  const bestIda = useMemo(() => {
    const ok = (job?.searches || []).filter((s) => s.direction === "IDA" && s.status === "OK" && s.priceCents > 0);
    return ok.sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);
  const bestVolta = useMemo(() => {
    const ok = (job?.searches || []).filter((s) => s.direction === "VOLTA" && s.status === "OK" && s.priceCents > 0);
    return ok.sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);

  const comboCents = (bestIda?.priceCents || 0) + (bestVolta?.priceCents || 0);
  const price123 = comboCents > 0 ? comboCents : bestIda?.priceCents || 0;
  const price123Label = comboCents > 0 ? "123milhas (ida + volta)" : "123milhas";

  const ciaRows = useMemo(() => {
    return CIA_META.map(({ key, label }) => {
      const q = ciaQuotes[key];
      const milesN = toMiles(q.miles);
      const feeCents = toCents(q.fee);
      const suggested = suggestedMilheiroCents(price123, milesN, feeCents);
      const milheiroCents = q.milheiroManual ? toCents(q.milheiro) : suggested;
      const total = milesN > 0 ? saleTotalCents(milesN, milheiroCents, feeCents) : 0;
      const discount = price123 > 0 && total > 0 ? price123 - total : 0;
      const discountPct = price123 > 0 && total > 0 ? Math.round((discount / price123) * 1000) / 10 : 0;
      return { key, label, milesN, feeCents, suggested, milheiroCents, total, discount, discountPct, q };
    });
  }, [ciaQuotes, price123]);

  const filledCias = ciaRows.filter((r) => r.milesN > 0 && r.total > 0);
  const bestCia = filledCias.length
    ? filledCias.reduce((a, b) => (a.total <= b.total ? a : b))
    : null;
  const progress = useMemo(() => {
    const rows = job?.searches || [];
    const done = rows.filter((s) => !["PENDING", "RUNNING"].includes(s.status)).length;
    return { done, total: rows.length };
  }, [job]);
  const extOk = extOn || progress.done > 0;

  async function start() {
    setLoading(true);
    try {
      const r = await fetch("/api/cotacao-passagens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origins,
          destinations,
          outboundFrom,
          outboundTo: outboundTo || null,
          outboundDays: Number(outboundDays || 1),
          includeReturn,
          returnFrom: returnFrom || null,
          returnTo: returnExact ? returnFrom : returnTo || null,
          returnDays: Number(returnDays || 1),
        }),
      });
      const j = await r.json();
      if (!j?.ok) {
        alert(j?.error || "Falha ao criar cotação.");
        return;
      }
      setJob(j.job);
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
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-12">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gestão de pontos</div>
            <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
              <Plane className="h-6 w-6 text-slate-500" />
              Cotação de passagens
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Monte o trecho e inicie. A extensão pesquisa o 123milhas atrás da sua tela (sem login) e preenche
              sozinha. Pode sair desta página; deixe o Chrome aberto.
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="mb-4 text-sm font-semibold">Pesquisa</div>
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
                placeholder="SSA, REC, FOR"
              />
            </div>
            <div>
              <label className={FIELD}>Ida a partir de</label>
              <input type="date" value={outboundFrom} onChange={(e) => setOutboundFrom(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={FIELD}>Ida até (opcional)</label>
              <input type="date" value={outboundTo} onChange={(e) => setOutboundTo(e.target.value)} className={INPUT} />
            </div>
            <div className="md:col-span-2">
              <label className={FIELD}>Ou quantos dias de ida</label>
              <input value={outboundDays} onChange={(e) => setOutboundDays(e.target.value)} className={INPUT} />
              <p className="mt-1 text-xs text-slate-500">Se não preencher a data final, usa essa quantidade (máx. 30).</p>
            </div>
            <label className="md:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeReturn} onChange={(e) => setIncludeReturn(e.target.checked)} />
              Pesquisar volta (trecho inverso)
            </label>
            {includeReturn ? (
              <>
                <label className="md:col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={returnExact} onChange={(e) => setReturnExact(e.target.checked)} />
                  Data exata de volta
                </label>
                <div>
                  <label className={FIELD}>{returnExact ? "Dia da volta" : "Volta a partir de"}</label>
                  <input type="date" value={returnFrom} onChange={(e) => setReturnFrom(e.target.value)} className={INPUT} />
                </div>
                {!returnExact ? (
                  <>
                    <div>
                      <label className={FIELD}>Volta até (opcional)</label>
                      <input type="date" value={returnTo} onChange={(e) => setReturnTo(e.target.value)} className={INPUT} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={FIELD}>Ou quantos dias de volta</label>
                      <input value={returnDays} onChange={(e) => setReturnDays(e.target.value)} className={INPUT} />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
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
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            A extensão pesquisa uma data por vez, sem login no 123milhas. Deixe o Chrome aberto.
            {job ? ` ${progress.done}/${progress.total} concluídas.` : ""}
          </p>
        </div>

        <div className="space-y-4">
          <BestCard title="Ida mais barata" row={bestIda} running={job?.status === "RUNNING"} />
          <BestCard title="Volta mais barata" row={bestVolta} running={job?.status === "RUNNING"} />
          {comboCents > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
              Ida + volta no 123milhas: <b>{fmtMoney(comboCents)}</b>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="text-sm font-semibold">Comparar milhas com o 123milhas</div>
        <p className="mt-1 text-sm text-slate-500">
          Preencha milhas e taxa de cada cia. O milheiro sugerido fica ~5% abaixo do Pix do 123, já descontando a
          taxa. Você pode editar o milheiro de cobrança à mão.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {ciaRows.map((r) => (
            <div key={r.key} className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="mt-3 grid gap-2">
                <div>
                  <label className={FIELD}>Milhas</label>
                  <input
                    value={r.q.miles}
                    onChange={(e) => patchCia(r.key, { miles: e.target.value, milheiroManual: false })}
                    className={INPUT}
                    placeholder="20000"
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
                  <label className={FIELD}>Milheiro de cobrança (R$)</label>
                  <input
                    value={r.q.milheiroManual ? r.q.milheiro : r.suggested ? fromCents(r.suggested) : ""}
                    onChange={(e) => patchCia(r.key, { milheiro: e.target.value, milheiroManual: true })}
                    className={INPUT}
                    placeholder="18,00"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Sugerido (−5%): {r.suggested ? fmtMoney(r.suggested) : "—"}
                    {r.q.milheiroManual ? (
                      <button
                        type="button"
                        className="ml-2 font-semibold text-slate-800 underline"
                        onClick={() => patchCia(r.key, { milheiroManual: false, milheiro: "" })}
                      >
                        usar sugestão
                      </button>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Seu total</span>
                  <span className="font-semibold tabular-nums">{r.total ? fmtMoney(r.total) : "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Desconto vs 123</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      r.discount > 0 ? "text-emerald-700" : r.discount < 0 ? "text-rose-700" : "text-slate-700"
                    )}
                  >
                    {r.total && price123 ? `${fmtMoney(r.discount)} (${r.discountPct}%)` : "—"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="p-3">Comparativo</th>
                <th className="p-3">123milhas</th>
                {ciaRows.map((r) => (
                  <th key={r.key} className="p-3">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="p-3 text-slate-500">Total a cobrar</td>
                <td className="p-3 font-semibold tabular-nums">{price123 ? fmtMoney(price123) : "—"}</td>
                {ciaRows.map((r) => (
                  <td
                    key={r.key}
                    className={cn(
                      "p-3 tabular-nums",
                      bestCia?.key === r.key && r.total ? "font-bold text-emerald-800" : "font-semibold"
                    )}
                  >
                    {r.total ? fmtMoney(r.total) : "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100">
                <td className="p-3 text-slate-500">Desconto vs 123</td>
                <td className="p-3 text-slate-400">base</td>
                {ciaRows.map((r) => (
                  <td key={r.key} className="p-3 tabular-nums">
                    {r.total && price123 ? fmtMoney(r.discount) : "—"}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-slate-100">
                <td className="p-3 text-slate-500">Milheiro de cobrança</td>
                <td className="p-3 text-slate-400">—</td>
                {ciaRows.map((r) => (
                  <td key={r.key} className="p-3 tabular-nums">
                    {r.milesN && r.milheiroCents ? fmtMoney(r.milheiroCents) : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">{price123Label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{fmtMoney(price123)}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <div className="text-xs font-semibold uppercase text-emerald-800">Melhor emissão</div>
            <div className="mt-1 text-lg font-bold tabular-nums">
              {bestCia ? `${bestCia.label} · ${fmtMoney(bestCia.total)}` : "Preencha as milhas"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Desconto total vs 123</div>
            <div className="mt-1 text-lg font-bold tabular-nums">
              {bestCia && price123
                ? `${fmtMoney(bestCia.discount)} (${bestCia.discountPct}%)`
                : "—"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={saveQuote}
          disabled={!job}
          className="mt-4 h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-50"
        >
          Salvar números
        </button>
      </div>

      {job?.searches?.length ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="p-3">Trecho</th>
                <th className="p-3">Data</th>
                <th className="p-3">Cia</th>
                <th className="p-3">123milhas</th>
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
                  <td className="p-3 tabular-nums">{s.priceCents ? fmtMoney(s.priceCents) : "—"}</td>
                  <td className="p-3 text-xs">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">{fmtMoney(row.priceCents)}</div>
          <div className="mt-1 text-xs text-slate-500">Valor no 123milhas (Pix)</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {latam ? (
              <a
                href={latam}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white"
              >
                Cote agora na LATAM
              </a>
            ) : null}
            {smiles ? (
              <a
                href={smiles}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
              >
                Cote agora na Smiles
              </a>
            ) : null}
            {azul ? (
              <a
                href={azul}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
              >
                Cote agora na Azul
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
