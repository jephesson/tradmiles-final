/* server-only */

/**
 * Este arquivo centraliza TODOS os cálculos/normalizações usados nas rotas.
 * - Tipos de linha (ItemLinha)
 * - Cálculo de deltas por programa (considera apenas itens LIBERADOS)
 * - Cálculo de totais (custo, milheiro, lucro)
 * - Helpers de compatibilidade (smartTotals, totalsCompatFromTotais, toDelta)
 */

export type ProgramaCIA = "latam" | "smiles";
export type ProgramaOrigem = "livelo" | "esfera";
export type ProgramaGeral = ProgramaCIA | ProgramaOrigem;
export type StatusItem = "aguardando" | "liberado";

export type ClubeItem = {
  id: number;
  programa: ProgramaGeral;
  pontos: number; // pts creditados no programa
  valor: number;  // R$
  status: StatusItem;
};

export type CompraItem = {
  id: number;
  programa: ProgramaGeral;
  pontos: number;   // pts base comprados/creditados
  valor: number;    // R$
  bonusPct: number; // %
  status: StatusItem;
};

export type TransfItem = {
  id: number;
  origem: ProgramaOrigem;     // banco de pontos
  destino: ProgramaCIA;       // cia aérea
  modo: "pontos" | "pontos+dinheiro";
  pontosUsados: number;       // pontos debitados do banco
  pontosTotais: number;       // quando há pontos+dinheiro, total chega aqui
  valorPago: number;          // R$
  bonusPct: number;           // %
  status: StatusItem;
};

export type ItemLinha =
  | { kind: "clube"; data: ClubeItem }
  | { kind: "compra"; data: CompraItem }
  | { kind: "transferencia"; data: TransfItem };

export type Delta = { latam?: number; smiles?: number; livelo?: number; esfera?: number };

export type Totais = {
  ptsLiberados: number;
  ptsAguardando: number;
  custoLiberado: number;
  custoAguardando: number;
  custoBase: number;
  taxaVendedores: number; // 1% do custoBase (padrão)
  comissao: number;
  custoTotal: number;
  custoTotalLiberado: number;
  custoMilheiro: number;        // sobre liberado
  custoMilheiroTotal: number;   // sobre total (lib+aguard)
  totalCIA: number;             // pts liberados + aguard
  lucroTotal: number;           // (meta - custoMilheiro liberado) * milheirosLiberados
};

export type TotaisCompat = {
  totalPts: number;
  custoTotal: number;
  custoMilheiro: number;
  lucroTotal: number;
};

/* ---------------- Helpers base ---------------- */
type AnyObj = Record<string, unknown>;

function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
function round(n: number): number {
  return Math.round(num(n));
}
function isRecord(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/* ---------------- Cálculo de contribuições ---------------- */
function contribCIA(l: ItemLinha): number {
  if (l.kind === "clube") {
    const { programa, pontos } = l.data;
    return programa === "latam" || programa === "smiles" ? num(pontos) : 0;
  }
  if (l.kind === "compra") {
    const { programa, pontos, bonusPct } = l.data;
    const base = num(pontos);
    return programa === "latam" || programa === "smiles"
      ? round(base * (1 + num(bonusPct) / 100))
      : 0;
  }
  // transferencia
  const { modo, pontosUsados, pontosTotais, bonusPct } = l.data;
  const base = modo === "pontos+dinheiro" ? num(pontosTotais) : num(pontosUsados);
  return round(base * (1 + num(bonusPct) / 100));
}

function valorItem(l: ItemLinha): number {
  if (l.kind === "transferencia") return num(l.data.valorPago);
  if (l.kind === "clube") return num(l.data.valor);
  return num(l.data.valor);
}

/* util: regra única para considerar um item como liberado
   (tolerante a "liberado" e "liberados") */
function isLiberado(l: ItemLinha): boolean {
  const s = String(l.data.status || "");
  return s === "liberado" || s === "liberados";
}

/* ---------------- Engine: Delta por programa (APENAS liberado) ---------------- */
export function computeDeltaPorPrograma(itens: ItemLinha[]): Required<Delta> {
  const d = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };

  for (const l of itens) {
    if (!isLiberado(l)) continue; // regra: saldo online só conta itens liberados

    if (l.kind === "clube") {
      d[l.data.programa as keyof typeof d] += num(l.data.pontos);
      continue;
    }

    if (l.kind === "compra") {
      const ptsFinal =
        l.data.programa === "latam" || l.data.programa === "smiles"
          ? round(num(l.data.pontos) * (1 + num(l.data.bonusPct) / 100))
          : num(l.data.pontos);
      d[l.data.programa as keyof typeof d] += ptsFinal;
      continue;
    }

    // transferencia: débito no banco e crédito na CIA (quando liberado)
    const { origem, destino, modo, pontosUsados, pontosTotais, bonusPct } = l.data;
    const base = modo === "pontos+dinheiro" ? num(pontosTotais) : num(pontosUsados);
    const chegam = round(base * (1 + num(bonusPct) / 100));

    d[destino] += chegam;            // crédito na CIA
    d[origem]  -= num(pontosUsados); // débito no banco
  }

  return d;
}

/* ---------------- Engine: Totais principais ---------------- */
export function computeTotais(
  itens: ItemLinha[],
  comissaoCedente: number,
  metaMilheiro: number,
  taxaVendedoresPct = 1
): Totais {
  const base = itens.reduce(
    (acc, l) => {
      const v = valorItem(l);
      const pts = contribCIA(l);
      const liberado = isLiberado(l);

      if (liberado) {
        acc.ptsLiberados += pts;
        acc.custoLiberado += v;
      } else {
        acc.ptsAguardando += pts;
        acc.custoAguardando += v;
      }
      acc.custoBase += v;
      return acc;
    },
    {
      ptsLiberados: 0,
      ptsAguardando: 0,
      custoLiberado: 0,
      custoAguardando: 0,
      custoBase: 0,
    }
  );

  const taxaVendedores = num(base.custoBase) * (num(taxaVendedoresPct) / 100);
  const comissao = num(comissaoCedente);
  const custoTotal = base.custoBase + taxaVendedores + comissao;

  const totalCIA = base.ptsLiberados + base.ptsAguardando;
  const milheirosTotais = totalCIA / 1000;
  const custoMilheiroTotal = milheirosTotais > 0 ? custoTotal / milheirosTotais : 0;

  const proporcaoLiberado = base.custoBase > 0 ? base.custoLiberado / base.custoBase : 0;
  const taxaVendLib = taxaVendedores * proporcaoLiberado;
  const comissaoLib = comissao * proporcaoLiberado;
  const custoTotalLiberado = base.custoLiberado + taxaVendLib + comissaoLib;

  const milheirosLiberados = base.ptsLiberados / 1000;
  const custoMilheiro = milheirosLiberados > 0 ? custoTotalLiberado / milheirosLiberados : 0;

  const meta = num(metaMilheiro);
  const lucroTotal = milheirosLiberados > 0 ? (meta - custoMilheiro) * milheirosLiberados : 0;

  return {
    ...base,
    taxaVendedores,
    comissao,
    custoTotal,
    custoTotalLiberado,
    custoMilheiro,
    custoMilheiroTotal,
    totalCIA,
    lucroTotal,
  };
}

/** Empacota tudo que a UI precisa num preview */
export function computePreview(payload: {
  itens: ItemLinha[];
  comissaoCedente: number;   // R$
  metaMilheiro: number;      // R$/milheiro
}) {
  const delta = computeDeltaPorPrograma(payload.itens);
  const totais = computeTotais(payload.itens, payload.comissaoCedente, payload.metaMilheiro, 1);
  return { deltaPorPrograma: delta, totais };
}

/** Calcula a diferença entre dois deltas para aplicar só o “net” */
export function diffDelta(novo?: Delta, antigo?: Delta): Required<Delta> {
  const n = novo || {};
  const a = antigo || {};
  return {
    latam: num(n.latam) - num(a.latam),
    smiles: num(n.smiles) - num(a.smiles),
    livelo: num(n.livelo) - num(a.livelo),
    esfera: num(n.esfera) - num(a.esfera),
  };
}

/** Inverte um delta (para reverter saldos) */
export function invertDelta(d?: Delta): Required<Delta> {
  return {
    latam: -num(d?.latam),
    smiles: -num(d?.smiles),
    livelo: -num(d?.livelo),
    esfera: -num(d?.esfera),
  };
}

/* ===========================================================
   ====== COMPAT: normalização de totais/deltas genéricos =====
   (para suportar documentos antigos/novos na collection)
   =========================================================== */

export function toDelta(x: unknown): Required<Delta> {
  const o = (typeof x === "object" && x) ? (x as Record<string, unknown>) : {};
  const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    latam: toNum(o.latam),
    smiles: toNum(o.smiles),
    livelo: toNum(o.livelo),
    esfera: toNum(o.esfera),
  };
}

/** Lê tanto totalCIA quanto pontosCIA (nome usado na tela nova) */
export function totalsCompatFromTotais(totais: unknown): TotaisCompat {
  const t = isRecord(totais) ? totais : {};
  const totalPtsRaw = num((t as AnyObj).totalCIA ?? (t as AnyObj).pontosCIA);
  const totalPts = Math.round(totalPtsRaw);
  const custoTotal = num((t as AnyObj).custoTotal ?? 0);
  const custoMilheiro =
    num((t as AnyObj).custoMilheiroTotal) > 0
      ? num((t as AnyObj).custoMilheiroTotal)
      : totalPts > 0
      ? custoTotal / (totalPts / 1000)
      : 0;
  const lucroTotal = num((t as AnyObj).lucroTotal ?? 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** quando vier no formato antigo (com resumo dentro de itens) */
function totalsFromItemsResumo(itens: unknown[]): TotaisCompat {
  type MediaState = { peso: number; acum: number };

  const safe: AnyObj[] = Array.isArray(itens) ? (itens as AnyObj[]) : [];
  const totalPts = safe.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.totalPts), 0);
  const custoTotal = safe.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.custoTotal), 0);

  const pesoAcum = safe.reduce<MediaState>(
    (acc, i) => {
      const milheiros = num((i.resumo as AnyObj | undefined)?.totalPts) / 1000;
      if (milheiros > 0) {
        acc.peso += milheiros;
        acc.acum += num((i.resumo as AnyObj | undefined)?.custoTotal) / milheiros;
      }
      return acc;
    },
    { peso: 0, acum: 0 }
  );

  const custoMilheiro = pesoAcum.peso > 0 ? pesoAcum.acum / pesoAcum.peso : 0;
  const lucroTotal = safe.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.lucroTotal), 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** novo formato: soma por kind aplicando bônus e custos corretos */
function totalsFromItemsData(itens: unknown[], totais?: unknown): TotaisCompat {
  const arr = Array.isArray(itens) ? (itens as AnyObj[]) : [];
  let totalPts = 0;
  let custoTotal = 0;

  for (const it of arr) {
    const kind = str((it as AnyObj).kind ?? (it as AnyObj).modo);
    const d = isRecord((it as AnyObj).data) ? ((it as AnyObj).data as AnyObj) : {};

    if (kind === "transferencia") {
      const modo = str(d.modo);
      const base = modo === "pontos+dinheiro" ? num(d.pontosTotais) : num(d.pontosUsados);
      const bonus = num(d.bonusPct);
      const chegam = Math.round(base * (1 + bonus / 100));
      totalPts += Math.max(0, chegam);
      custoTotal += num(d.valorPago);
      continue;
    }

    if (kind === "compra") {
      const programa = str(d.programa);
      const ptsBase = num(d.pontos);
      const bonus = num(d.bonusPct);
      if (programa === "latam" || programa === "smiles") {
        totalPts += Math.round(ptsBase * (1 + bonus / 100));
      }
      custoTotal += num(d.valor);
      continue;
    }

    if (kind === "clube") {
      const programa = str(d.programa);
      const pts = num(d.pontos);
      if (programa === "latam" || programa === "smiles") {
        totalPts += Math.max(0, pts);
      }
      custoTotal += num(d.valor);
      continue;
    }

    // Fallbacks genéricos
    const ptsCandidates = [
      d.chegam,
      d.chegamPts,
      d.totalCIA,
      d.pontosCIA,
      d.total_destino,
      d.total,
      d.quantidade,
      d.pontosTotais,
      d.pontosUsados,
      d.pontos,
    ];
    const custoCandidates = [d.custoTotal, d.valor, d.valorPago, d.precoTotal, d.preco, d.custo];

    const pts = num(ptsCandidates.find((v) => num(v) > 0));
    const custo = num(custoCandidates.find((v) => num(v) > 0));

    const tot = isRecord((it as AnyObj).totais) ? ((it as AnyObj).totais as AnyObj) : undefined;
    const ptsAlt = num(tot?.totalCIA ?? tot?.pontosCIA ?? (tot as AnyObj | undefined)?.cia);
    const custoAlt = num(tot?.custoTotal);

    totalPts += pts > 0 ? pts : ptsAlt;
    custoTotal += custo > 0 ? custo : custoAlt;

    if (!(pts > 0 || ptsAlt > 0) && isRecord((it as AnyObj).resumo)) {
      totalPts += num(((it as AnyObj).resumo as AnyObj).totalPts);
    }
    if (!(custo > 0 || custoAlt > 0) && isRecord((it as AnyObj).resumo)) {
      custoTotal += num(((it as AnyObj).resumo as AnyObj).custoTotal);
    }
  }

  // Se veio um objeto totais já normalizado, preferimos custoMilheiro dele quando válido
  let custoMilheiro =
    totalPts > 0 ? custoTotal / (totalPts / 1000) : 0;
  if (isRecord(totais) && num((totais as AnyObj).custoMilheiroTotal) > 0) {
    custoMilheiro = num((totais as AnyObj).custoMilheiroTotal);
  }

  const lucroTotal = arr.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.lucroTotal), 0);

  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** escolhe automaticamente o melhor jeito de consolidar totais */
export function smartTotals(itens: unknown[], totais?: unknown): TotaisCompat {
  if (
    totais &&
    (isRecord(totais) &&
      ("totalCIA" in totais ||
        "pontosCIA" in totais ||
        "custoTotal" in totais ||
        "custoMilheiroTotal" in totais))
  ) {
    return totalsCompatFromTotais(totais);
  }
  const hasResumo =
    Array.isArray(itens) &&
    (itens as AnyObj[]).some((i) => isRecord(i.resumo));
  if (hasResumo) return totalsFromItemsResumo(itens as AnyObj[]);
  return totalsFromItemsData(itens, totais);
}
