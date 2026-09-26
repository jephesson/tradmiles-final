function reaisFromCents(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n) / 100;
}

function transformCents(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => transformCents(item));
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/Cents$/i.test(key)) {
      out[key.replace(/Cents$/i, "Reais")] = reaisFromCents(nested);
      continue;
    }
    if (key === "identificador" || key === "cpf" || key === "email") continue;
    out[key] = transformCents(nested);
  }
  return out;
}

function lastItems<T>(arr: unknown, n: number): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(Math.max(0, arr.length - n)) as T[];
}

/** Recorte enxuto do /api/analytics: valores em reais, sem CPF/e-mail. */
export function compactAnalyticsForAi(data: unknown) {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, any>;
  const balcao = d.balcao && typeof d.balcao === "object" ? d.balcao : {};

  const compact = {
    filtros: d.filters ?? null,
    hoje: d.today ?? null,
    hojePorFuncionario: Array.isArray(d.todayByEmployee)
      ? d.todayByEmployee
      : Array.isArray(d.byEmployeeToday)
        ? d.byEmployeeToday
        : [],
    mesFoco: d.consolidated ?? null,
    resumoMes: d.summary ?? null,
    desempenhoMesAtual: d.currentMonthPerformance ?? null,
    mesAtualVsAnterior: d.currentVsPrevious ?? null,
    porFuncionarioMes: Array.isArray(d.byEmployee) ? d.byEmployee.slice(0, 20) : [],
    meses: Array.isArray(d.months) ? d.months.slice(-18) : [],
    lucroPorMes: Array.isArray(d.profitMonths) ? d.profitMonths.slice(-18) : [],
    milheiroMensal: Array.isArray(d.milheiroMonthly) ? d.milheiroMonthly.slice(-18) : [],
    mediaMensalBrutaReais: reaisFromCents(d.avgMonthlyGrossCents),
    compras: d.purchases ?? null,
    clubesPorMes: Array.isArray(d.clubsByMonth) ? d.clubsByMonth.slice(-18) : [],
    topClientes: Array.isArray(d.topClients)
      ? d.topClients.slice(0, 10).map((c: any) => ({
          nome: c?.nome,
          vendas: c?.salesCount,
          passageiros: c?.passengers,
          valorReais: reaisFromCents(c?.grossCents),
        }))
      : [],
    diasDaSemana: d.byDow ?? null,
    serieDiaria: lastItems(d.days, 45),
    milheiroDiario: lastItems(d.milheiroDaily, 45),
    historicoDiario: lastItems(d.salesDailyHistory, 60),
    balcao: {
      imposto: balcao.taxRule ?? null,
      hoje: balcao.today ?? null,
      mes: balcao.month ?? null,
      mesAtual: balcao.currentMonth ?? null,
      mesAnterior: balcao.previousMonth ?? null,
      porCia: Array.isArray(balcao.byAirline) ? balcao.byAirline.slice(0, 12) : [],
      porFuncionario: Array.isArray(balcao.byEmployee)
        ? balcao.byEmployee.slice(0, 20)
        : [],
      meses: Array.isArray(balcao.months) ? balcao.months.slice(-18) : [],
      dias: lastItems(balcao.days, 45),
    },
  };

  return transformCents(compact);
}
