"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LineChart, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  applyManualExclusions,
  buildDailySeries,
  monthlyAverages,
  type CaixaSnapshotPoint,
  type ManualExclusion,
} from "@/lib/caixa-snapshot-analysis";

type CurveMode = "split" | "resumo" | "caixa" | "both";

function fmtMoneyBR(reais: number | null | undefined) {
  if (reais == null || !Number.isFinite(reais)) return "—";
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function centsToReais(cents: number | null) {
  if (cents == null || !Number.isFinite(cents)) return null;
  return cents / 100;
}

function LineChartSvg({
  points,
  color,
  height = 220,
}: {
  points: { x: string; y: number | null }[];
  color: string;
  height?: number;
}) {
  const width = 920;
  const pad = { l: 78, r: 18, t: 18, b: 36 };
  const usable = points.filter((p) => p.y != null) as { x: string; y: number }[];
  if (usable.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        Poucos pontos para desenhar a curva.
      </div>
    );
  }
  const ys = usable.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || Math.max(1, Math.abs(max) * 0.08);
  const yMin = min - span * 0.08;
  const yMax = max + span * 0.08;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xFor = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * innerW;
  const yFor = (y: number) => pad.t + ((yMax - y) / (yMax - yMin)) * innerH;

  const d = points
    .map((p, i) => {
      if (p.y == null) return null;
      const cmd = i === 0 || points.slice(0, i).every((q) => q.y == null) ? "M" : "L";
      return `${cmd}${xFor(i).toFixed(1)},${yFor(p.y).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const ticks = [yMax, (yMax + yMin) / 2, yMin];
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px]">
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={pad.l}
            x2={width - pad.r}
            y1={yFor(t)}
            y2={yFor(t)}
            stroke="#e2e8f0"
            strokeDasharray={i === 1 ? "4 6" : undefined}
          />
          <text x={pad.l - 8} y={yFor(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
            {fmtMoneyBR(t)}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) =>
        p.y == null ? null : (
          <circle key={i} cx={xFor(i)} cy={yFor(p.y)} r="3.2" fill={color} stroke="#fff" strokeWidth="1.4" />
        )
      )}
      {points.map((p, i) => {
        if (i !== 0 && i !== points.length - 1 && i % labelStep !== 0) return null;
        return (
          <text
            key={`l-${i}`}
            x={xFor(i)}
            y={height - 12}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            className="fill-slate-500 text-[11px]"
          >
            {p.x}
          </text>
        );
      })}
    </svg>
  );
}

function OverlayChart({
  resumo,
  caixa,
}: {
  resumo: { x: string; y: number | null }[];
  caixa: { x: string; y: number | null }[];
}) {
  const width = 920;
  const height = 240;
  const pad = { l: 78, r: 18, t: 18, b: 36 };
  const ys = [...resumo, ...caixa].map((p) => p.y).filter((n): n is number => n != null);
  if (ys.length < 2) {
    return <div className="py-10 text-center text-sm text-slate-500">Poucos pontos.</div>;
  }
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const yMin = min - span * 0.08;
  const yMax = max + span * 0.08;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = Math.max(resumo.length, caixa.length, 1);
  const xFor = (i: number) => pad.l + (i / Math.max(1, n - 1)) * innerW;
  const yFor = (y: number) => pad.t + ((yMax - y) / (yMax - yMin)) * innerH;
  const pathOf = (pts: { y: number | null }[]) =>
    pts
      .map((p, i) => {
        if (p.y == null) return null;
        const cmd = i === 0 || pts.slice(0, i).every((q) => q.y == null) ? "M" : "L";
        return `${cmd}${xFor(i).toFixed(1)},${yFor(p.y).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[640px]">
      {[yMax, (yMax + yMin) / 2, yMin].map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={width - pad.r} y1={yFor(t)} y2={yFor(t)} stroke="#e2e8f0" />
          <text x={pad.l - 8} y={yFor(t) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
            {fmtMoneyBR(t)}
          </text>
        </g>
      ))}
      <path d={pathOf(resumo)} fill="none" stroke="#0ea5e9" strokeWidth="2.5" />
      <path d={pathOf(caixa)} fill="none" stroke="#10b981" strokeWidth="2.5" />
    </svg>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function momClass(v: number | null) {
  return cn(
    "px-4 py-2.5 text-right tabular-nums font-medium",
    v == null ? "text-slate-400" : v >= 0 ? "text-emerald-700" : "text-rose-700"
  );
}

export default function AnaliseCaixaClient() {
  const [points, setPoints] = useState<CaixaSnapshotPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exclusions, setExclusions] = useState<Record<string, { resumo: boolean; caixa: boolean }>>({});
  const [curveMode, setCurveMode] = useState<CurveMode>("split");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/resumo/caixa-analise", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar.");
        if (!cancelled) setPoints(Array.isArray(json.points) ? json.points : []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dailyRaw = useMemo(() => buildDailySeries(points), [points]);
  const exclusionList = useMemo<ManualExclusion[]>(
    () =>
      Object.entries(exclusions)
        .filter(([, v]) => v.resumo || v.caixa)
        .map(([dayKey, v]) => ({ dayKey, resumo: v.resumo, caixa: v.caixa })),
    [exclusions]
  );
  const daily = useMemo(
    () => applyManualExclusions(dailyRaw, exclusionList),
    [dailyRaw, exclusionList]
  );
  const months = useMemo(() => monthlyAverages(daily), [daily]);
  const excludedCount = exclusionList.length;

  const resumoLine = daily.map((d) => ({ x: d.label.slice(0, 5), y: centsToReais(d.resumoCents) }));
  const caixaLine = daily.map((d) => ({ x: d.label.slice(0, 5), y: centsToReais(d.caixaCents) }));
  const monthResumo = months.map((m) => ({ x: m.label, y: m.resumoAvgReais }));
  const monthCaixa = months.map((m) => ({ x: m.label, y: m.caixaAvgReais }));
  const daysNewestFirst = useMemo(() => [...dailyRaw].reverse(), [dailyRaw]);

  function toggleExclusion(dayKey: string, field: "resumo" | "caixa") {
    setExclusions((prev) => {
      const cur = prev[dayKey] || { resumo: false, caixa: false };
      const next = { ...cur, [field]: !cur[field] };
      if (!next.resumo && !next.caixa) {
        const { [dayKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [dayKey]: next };
    });
  }

  function toggleDayBoth(dayKey: string) {
    setExclusions((prev) => {
      const cur = prev[dayKey] || { resumo: false, caixa: false };
      const on = !(cur.resumo && cur.caixa);
      if (!on) {
        const { [dayKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [dayKey]: { resumo: true, caixa: true } };
    });
  }

  async function gerarAnalise() {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await fetch("/api/resumo/caixa-analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclusions: exclusionList, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setAiError(String(json?.error || "Não foi possível gerar a análise."));
        return;
      }
      setAiText(String(json.text || "").trim());
    } catch {
      setAiError("Falha de rede ao gerar a análise.");
    } finally {
      setAiLoading(false);
    }
  }

  const showResumo = curveMode === "split" || curveMode === "resumo" || curveMode === "both";
  const showCaixa = curveMode === "split" || curveMode === "caixa" || curveMode === "both";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/resumo"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao resumo
        </Link>
        <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
          <LineChart className="h-3.5 w-3.5" strokeWidth={2.2} />
          Histórico manual
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Análise do caixa</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Médias mensais, curvas do total e do caixa imediato. Você marca na mão quais dias tirar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-800">
          {excludedCount
            ? `${excludedCount} dia(s) tirado(s) na mão`
            : "Nenhum dia tirado — marque na tabela abaixo."}
        </span>
        {excludedCount ? (
          <button
            type="button"
            onClick={() => setExclusions({})}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Limpar exclusões
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["split", "Curvas separadas"],
            ["resumo", "Só total (resumo)"],
            ["caixa", "Só caixa imediato"],
            ["both", "As duas juntas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setCurveMode(id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              curveMode === id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando snapshots…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-8 text-sm text-rose-800">{error}</div>
      ) : (
        <>
          {curveMode === "both" ? (
            <ChartCard title="Evolução diária (último ponto de cada dia)">
              <OverlayChart resumo={resumoLine} caixa={caixaLine} />
            </ChartCard>
          ) : (
            <>
              {showResumo ? (
                <ChartCard title="Total (resumo)" hint="Milhas + saldos − dívidas">
                  <LineChartSvg points={resumoLine} color="#0ea5e9" />
                </ChartCard>
              ) : null}
              {showCaixa ? (
                <ChartCard title="Caixa imediato" hint="Liquidez de curto prazo">
                  <LineChartSvg points={caixaLine} color="#10b981" />
                </ChartCard>
              ) : null}
            </>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {showResumo ? (
              <ChartCard title="Média mensal · total">
                <LineChartSvg points={monthResumo} color="#0369a1" height={200} />
              </ChartCard>
            ) : null}
            {showCaixa ? (
              <ChartCard title="Média mensal · caixa imediato">
                <LineChartSvg points={monthCaixa} color="#047857" height={200} />
              </ChartCard>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">
              Comparação mês a mês (média dos dias)
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Mês</th>
                    <th className="px-4 py-3 text-right">Dias</th>
                    <th className="px-4 py-3 text-right">Média total</th>
                    <th className="px-4 py-3 text-right">vs mês ant.</th>
                    <th className="px-4 py-3 text-right">Média caixa</th>
                    <th className="px-4 py-3 text-right">vs mês ant.</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className="border-b border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{m.label}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{m.days}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoneyBR(m.resumoAvgReais)}</td>
                      <td className={momClass(m.resumoMomPct)}>{fmtPct(m.resumoMomPct)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoneyBR(m.caixaAvgReais)}</td>
                      <td className={momClass(m.caixaMomPct)}>{fmtPct(m.caixaMomPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <div className="text-sm font-semibold text-slate-900">Tirar outliers na mão</div>
              <p className="mt-0.5 text-xs text-slate-500">
                Marque o dia (ou só total / só caixa). Ponto sugerido = valor bem fora da faixa, mas só sai se você
                marcar.
              </p>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">Dia</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-center">Tirar total</th>
                    <th className="px-4 py-2.5 text-right">Caixa</th>
                    <th className="px-4 py-2.5 text-center">Tirar caixa</th>
                    <th className="px-4 py-2.5 text-center">Dia inteiro</th>
                  </tr>
                </thead>
                <tbody>
                  {daysNewestFirst.map((d) => {
                    const ex = exclusions[d.dayKey] || { resumo: false, caixa: false };
                    return (
                      <tr
                        key={d.dayKey}
                        className={cn(
                          "border-b border-slate-100",
                          ex.resumo || ex.caixa ? "bg-amber-50/70" : "hover:bg-slate-50/80"
                        )}
                      >
                        <td className="px-4 py-2 text-slate-800">
                          {d.label}
                          {d.suggestedResumo || d.suggestedCaixa ? (
                            <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              sugestão
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {fmtMoneyBR(centsToReais(d.resumoCents))}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={ex.resumo}
                            onChange={() => toggleExclusion(d.dayKey, "resumo")}
                          />
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {fmtMoneyBR(centsToReais(d.caixaCents))}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={ex.caixa}
                            onChange={() => toggleExclusion(d.dayKey, "caixa")}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleDayBoth(d.dayKey)}
                            className="text-xs font-semibold text-sky-700 hover:underline"
                          >
                            {ex.resumo && ex.caixa ? "Restaurar" : "Tirar"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
        <div className="font-semibold text-slate-900">Leitura da evolução</div>
        <p className="mt-1 text-sm text-slate-600">
          Texto comparando os meses, no tom de uma conversa — não um bloco automático de bullets.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1200}
          placeholder="Opcional: o que enfatizar (ex.: junho vs julho, efeito de um saque)"
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-900/10"
        />
        <button
          type="button"
          onClick={gerarAnalise}
          disabled={aiLoading || loading}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-55"
        >
          {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {aiLoading ? "Escrevendo…" : aiText ? "Gerar de novo" : "Gerar análise"}
        </button>
        {aiError ? <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">{aiError}</div> : null}
        {aiText ? (
          <div className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-800">
            {aiText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
