export type CaixaSnapshotPoint = {
  capturedAt: string;
  resumoCents: number | null;
  caixaCents: number | null;
};

export type CaixaDailyPoint = {
  dayKey: string;
  label: string;
  capturedAt: string;
  resumoCents: number | null;
  caixaCents: number | null;
  suggestedResumo: boolean;
  suggestedCaixa: boolean;
};

export type CaixaMonthAvg = {
  month: string;
  label: string;
  days: number;
  resumoAvgReais: number | null;
  caixaAvgReais: number | null;
  resumoLastReais: number | null;
  caixaLastReais: number | null;
  resumoMomPct: number | null;
  caixaMomPct: number | null;
};

function toReais(cents: number | null) {
  if (cents == null || !Number.isFinite(cents)) return null;
  return Math.round(cents) / 100;
}

export function snapshotDayKeySP(raw: string) {
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(d)
      .reduce((acc: Record<string, string>, p) => {
        acc[p.type] = p.value;
        return acc;
      }, {});
    if (parts.year && parts.month && parts.day) {
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
  }
  return String(raw || "").slice(0, 10);
}

export function dayLabelBR(dayKey: string) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dayKey;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function monthLabelBR(month: string) {
  const m = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  return `${m[2]}/${m[1]}`;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

function iqrFence(values: number[]) {
  const s = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (s.length < 8) return { lo: -Infinity, hi: Infinity };
  const q1 = percentile(s, 0.25);
  const q3 = percentile(s, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) return { lo: -Infinity, hi: Infinity };
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
}

export function buildDailySeries(points: CaixaSnapshotPoint[]): CaixaDailyPoint[] {
  const byDay = new Map<string, CaixaSnapshotPoint[]>();
  const sorted = [...points].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  for (const p of sorted) {
    const key = snapshotDayKeySP(p.capturedAt);
    if (!key) continue;
    const bucket = byDay.get(key) || [];
    bucket.push(p);
    byDay.set(key, bucket);
  }

  const daily: CaixaDailyPoint[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dayKey, rows]) => {
      const last = rows[rows.length - 1];
      const lastResumo = [...rows].reverse().find((r) => r.resumoCents != null);
      const lastCaixa = [...rows].reverse().find((r) => r.caixaCents != null);
      return {
        dayKey,
        label: dayLabelBR(dayKey),
        capturedAt: last.capturedAt,
        resumoCents: lastResumo?.resumoCents ?? null,
        caixaCents: lastCaixa?.caixaCents ?? null,
        suggestedResumo: false,
        suggestedCaixa: false,
      };
    });

  const resumoFence = iqrFence(daily.map((d) => d.resumoCents).filter((n): n is number => n != null));
  const caixaFence = iqrFence(daily.map((d) => d.caixaCents).filter((n): n is number => n != null));

  return daily.map((d) => ({
    ...d,
    suggestedResumo:
      d.resumoCents != null && (d.resumoCents < resumoFence.lo || d.resumoCents > resumoFence.hi),
    suggestedCaixa:
      d.caixaCents != null && (d.caixaCents < caixaFence.lo || d.caixaCents > caixaFence.hi),
  }));
}

export type ManualExclusion = {
  dayKey: string;
  resumo?: boolean;
  caixa?: boolean;
};

export function applyManualExclusions(
  daily: CaixaDailyPoint[],
  exclusions: ManualExclusion[]
): CaixaDailyPoint[] {
  if (!exclusions.length) return daily;
  const map = new Map(exclusions.map((e) => [e.dayKey, e]));
  return daily.map((d) => {
    const ex = map.get(d.dayKey);
    if (!ex) return d;
    return {
      ...d,
      resumoCents: ex.resumo ? null : d.resumoCents,
      caixaCents: ex.caixa ? null : d.caixaCents,
    };
  });
}

function avg(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function momPct(curr: number | null, prev: number | null) {
  if (curr == null || prev == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function monthlyAverages(daily: CaixaDailyPoint[]): CaixaMonthAvg[] {
  const byMonth = new Map<string, CaixaDailyPoint[]>();
  for (const d of daily) {
    const month = d.dayKey.slice(0, 7);
    const bucket = byMonth.get(month) || [];
    bucket.push(d);
    byMonth.set(month, bucket);
  }

  const months = [...byMonth.keys()].sort();
  const rows: CaixaMonthAvg[] = months.map((month) => {
    const days = byMonth.get(month) || [];
    const resumo = days.map((d) => d.resumoCents).filter((n): n is number => n != null);
    const caixa = days.map((d) => d.caixaCents).filter((n): n is number => n != null);
    const lastResumo = [...days].reverse().find((d) => d.resumoCents != null)?.resumoCents ?? null;
    const lastCaixa = [...days].reverse().find((d) => d.caixaCents != null)?.caixaCents ?? null;
    return {
      month,
      label: monthLabelBR(month),
      days: days.length,
      resumoAvgReais: toReais(avg(resumo)),
      caixaAvgReais: toReais(avg(caixa)),
      resumoLastReais: toReais(lastResumo),
      caixaLastReais: toReais(lastCaixa),
      resumoMomPct: null,
      caixaMomPct: null,
    };
  });

  return rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    return {
      ...row,
      resumoMomPct: momPct(row.resumoAvgReais, prev?.resumoAvgReais ?? null),
      caixaMomPct: momPct(row.caixaAvgReais, prev?.caixaAvgReais ?? null),
    };
  });
}

export function compactCaixaForAi(input: {
  exclusions: ManualExclusion[];
  months: CaixaMonthAvg[];
  lastDaily: CaixaDailyPoint[];
}) {
  const last = input.lastDaily.slice(-14).map((d) => ({
    dia: d.label,
    resumoReais: toReais(d.resumoCents),
    caixaReais: toReais(d.caixaCents),
  }));
  return {
    unidade: "reais",
    outliersTiradosNaMao: input.exclusions.map((e) => ({
      dia: e.dayKey,
      tirouTotal: Boolean(e.resumo),
      tirouCaixaImediato: Boolean(e.caixa),
    })),
    mediasMensais: input.months.map((m) => ({
      mes: m.label,
      dias: m.days,
      mediaResumo: m.resumoAvgReais,
      mediaCaixaImediato: m.caixaAvgReais,
      ultimoResumo: m.resumoLastReais,
      ultimoCaixaImediato: m.caixaLastReais,
      variacaoResumoVsMesAnteriorPct: m.resumoMomPct == null ? null : Number(m.resumoMomPct.toFixed(1)),
      variacaoCaixaVsMesAnteriorPct: m.caixaMomPct == null ? null : Number(m.caixaMomPct.toFixed(1)),
    })),
    ultimos14Dias: last,
    nota:
      "Resumo = caixa total (milhas + saldos − dívidas). Caixa imediato = liquidez de curto prazo. Não misture os dois. Pontos tirados na mão não entram nas médias.",
  };
}
