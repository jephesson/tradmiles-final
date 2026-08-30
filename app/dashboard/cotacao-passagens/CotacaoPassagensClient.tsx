"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plane, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import { airlineSite, saleTotalCents, suggestedMilheiroCents } from "@/lib/cotacao-passagens";

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
  searches: SearchRow[];
};

const ZIP_HREF = "/downloads/trademiles-cotacao-123-extension.zip";
const FIELD = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const INPUT =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10";

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const [miles, setMiles] = useState("");
  const [milheiro, setMilheiro] = useState("");
  const [boarding, setBoarding] = useState("0,00");

  async function load(id?: string) {
    const qs = id ? `?id=${encodeURIComponent(id)}` : "";
    const r = await fetch(`/api/cotacao-passagens${qs}`, { cache: "no-store" });
    const j = await r.json();
    if (j?.ok && j.job) {
      setJob(j.job);
      if (!miles && j.job.quoteMiles) setMiles(String(j.job.quoteMiles));
      if (!milheiro && j.job.quoteMilheiroCents) setMilheiro(fromCents(j.job.quoteMilheiroCents));
      if (j.job.quoteBoardingFeeCents) setBoarding(fromCents(j.job.quoteBoardingFeeCents));
    }
    return j?.job as Job | null;
  }

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.tmCotacaoJob = job?.status === "RUNNING" && job.id ? job.id : "";
    const onBridge = (e: Event) => {
      const connected = Boolean((e as CustomEvent<{ connected?: boolean }>).detail?.connected);
      setExtOn(connected);
    };
    window.addEventListener("tm-cotacao-bridge", onBridge);
    return () => {
      delete document.body.dataset.tmCotacaoJob;
      window.removeEventListener("tm-cotacao-bridge", onBridge);
    };
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!job || job.status !== "RUNNING") return;
    const t = setInterval(() => load(job.id), 2500);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  const bestIda = useMemo(() => {
    const ok = (job?.searches || []).filter((s) => s.direction === "IDA" && s.status === "OK" && s.priceCents > 0);
    return ok.sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);
  const bestVolta = useMemo(() => {
    const ok = (job?.searches || []).filter((s) => s.direction === "VOLTA" && s.status === "OK" && s.priceCents > 0);
    return ok.sort((a, b) => a.priceCents - b.priceCents)[0] || null;
  }, [job]);

  const comboCents = (bestIda?.priceCents || 0) + (bestVolta?.priceCents || 0);
  const milesN = Math.max(0, Math.trunc(Number(miles.replace(/\D/g, "")) || 0));
  const milheiroCents = toCents(milheiro);
  const boardingCents = toCents(boarding);
  const suggested = suggestedMilheiroCents(comboCents || bestIda?.priceCents || 0, milesN, boardingCents);
  const saleTotal = saleTotalCents(milesN, milheiroCents || suggested, boardingCents);
  const progress = useMemo(() => {
    const rows = job?.searches || [];
    const done = rows.filter((s) => !["PENDING", "RUNNING"].includes(s.status)).length;
    return { done, total: rows.length };
  }, [job]);

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
    await fetch(`/api/cotacao-passagens/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteMiles: milesN,
        quoteMilheiroCents: milheiroCents || suggested,
        quoteBoardingFeeCents: boardingCents,
      }),
    });
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
              Monte o trecho e inicie. A extensão pesquisa o 123milhas em uma janela minimizada (sem login) e vai
              preenchendo sozinha. Pode sair desta página; deixe o Chrome aberto.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-full px-3 text-[11px] font-semibold",
                extOn ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
              )}
            >
              {extOn ? "Extensão conectada" : "Extensão não detectada — baixe de novo (v1.2.1)"}
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
            Instale a extensão v1.2.1. O 123milhas precisa renderizar (uma janela abre atrás da sua). Não precisa
            login lá. Pode sair desta página; deixe o Chrome aberto.
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
        <div className="text-sm font-semibold">Cotar na cia aérea e fechar milheiro</div>
        <p className="mt-1 text-sm text-slate-500">
          Abra a cia do trecho mais barato, cote as milhas e compare com o 123. A sugestão fica cerca de 5% abaixo
          do Pix do 123, já descontando a taxa de embarque.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className={FIELD}>Milhas</label>
            <input value={miles} onChange={(e) => setMiles(e.target.value)} className={INPUT} placeholder="20000" />
          </div>
          <div>
            <label className={FIELD}>Milheiro de venda (R$)</label>
            <input value={milheiro} onChange={(e) => setMilheiro(e.target.value)} className={INPUT} placeholder="18,00" />
          </div>
          <div>
            <label className={FIELD}>Taxa de embarque (R$)</label>
            <input value={boarding} onChange={(e) => setBoarding(e.target.value)} className={INPUT} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Milheiro sugerido (−5%)</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{fmtMoney(suggested)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">Total da venda (milhas + taxa)</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{fmtMoney(saleTotal)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase text-slate-500">123milhas (ida+volta)</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{fmtMoney(comboCents)}</div>
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
  const site = row ? airlineSite(row.airline) : "";
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
          {site ? (
            <a
              href={site}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-9 items-center rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white"
            >
              Cote agora na {row.airline}
            </a>
          ) : (
            <div className="mt-3 text-sm font-medium text-amber-800">Cote este trecho na cia aérea.</div>
          )}
        </>
      ) : (
        <div className="mt-2 text-sm text-slate-500">
          {running ? "Aguardando o primeiro resultado da extensão…" : "Ainda sem resultado."}
        </div>
      )}
    </div>
  );
}
