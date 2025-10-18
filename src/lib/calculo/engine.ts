/* server-only */

export type ProgramaCIA = "latam" | "smiles";
export type ProgramaOrigem = "livelo" | "esfera";
export type ProgramaGeral = ProgramaCIA | ProgramaOrigem;
export type StatusItem = "aguardando" | "liberado";

export type ClubeItem = {
  id: number;
  programa: ProgramaGeral;
  pontos: number;
  valor: number; // R$
  status: StatusItem;
};
export type CompraItem = {
  id: number;
  programa: ProgramaGeral;
  pontos: number;
  valor: number;
  bonusPct: number; // %
  status: StatusItem;
};
export type TransfItem = {
  id: number;
  origem: ProgramaOrigem;
  destino: ProgramaCIA;
  modo: "pontos" | "pontos+dinheiro";
  pontosUsados: number;
  pontosTotais: number;
  valorPago: number;
  bonusPct: number;
  status: StatusItem;
};
export type ItemLinha =
  | { kind: "clube"; data: ClubeItem }
  | { kind: "compra"; data: CompraItem }
  | { kind: "transferencia"; data: TransfItem };

export type Delta = { latam?: number; smiles?: number; livelo?: number; esfera?: number };

function num(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
function round(n: number): number {
  return Math.round(num(n));
}

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

/** Delta por programa (previsto) a partir dos itens da compra */
export function computeDeltaPorPrograma(itens: ItemLinha[]): Required<Delta> {
  const d = { latam: 0, smiles: 0, livelo: 0, esfera: 0 };
  for (const l of itens) {
    if (l.kind === "clube") {
      d[l.data.programa as keyof typeof d] += num(l.data.pontos);
    } else if (l.kind === "compra") {
      const ptsFinal =
        l.data.programa === "latam" || l.data.programa === "smiles"
          ? round(num(l.data.pontos) * (1 + num(l.data.bonusPct) / 100))
          : num(l.data.pontos);
      d[l.data.programa as keyof typeof d] += ptsFinal;
    } else {
      const { origem, destino, modo, pontosUsados, pontosTotais, bonusPct } = l.data;
      const base = modo === "pontos+dinheiro" ? num(pontosTotais) : num(pontosUsados);
      const chegam = round(base * (1 + num(bonusPct) / 100));
      d[destino] += chegam;           // crédito na CIA
      d[origem] -= num(pontosUsados); // débito no banco
    }
  }
  return d;
}

export type Totais = {
  ptsLiberados: number;
  ptsAguardando: number;
  custoLiberado: number;
  custoAguardando: number;
  custoBase: number;
  taxaVendedores: number; // 1% do custoBase
  comissao: number;
  custoTotal: number;
  custoTotalLiberado: number;
  custoMilheiro: number;        // sobre liberado
  custoMilheiroTotal: number;   // sobre total (lib+aguard)
  totalCIA: number;             // pts liberados + aguard
  lucroTotal: number;           // (meta - custoMilheiro liberado) * milheirosLiberados
};

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
      const liberado =
        (l.kind === "clube" && l.data.status === "liberado") ||
        (l.kind === "compra" && l.data.status === "liberado") ||
        (l.kind === "transferencia" && l.data.status === "liberado");

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

/* ===================== COMPAT HELPERS PARA A ROTA ===================== */

export type TotaisCompat = {
  totalPts: number;
  custoTotal: number;
  custoMilheiro: number;
  lucroTotal: number;
};

/** Guarda de tipo p/ detectar objeto com campos de totais compatíveis */
function hasCompatKeys(o: unknown): o is {
  totalCIA?: unknown;
  pontosCIA?: unknown;
  custoTotal?: unknown;
  custoMilheiroTotal?: unknown;
  lucroTotal?: unknown;
} {
  if (typeof o !== "object" || o === null) return false;
  const r = o as Record<string, unknown>;
  return (
    "totalCIA" in r ||
    "pontosCIA" in r ||
    "custoTotal" in r ||
    "custoMilheiroTotal" in r ||
    "lucroTotal" in r
  );
}

/** Normaliza qualquer unknown para Delta com números (0 se inválido) */
export function toDelta(x: unknown): Delta {
  const o = (typeof x === "object" && x) ? (x as Record<string, unknown>) : {};
  const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    latam: toNum(o.latam),
    smiles: toNum(o.smiles),
    livelo: toNum(o.livelo),
    esfera: toNum(o.esfera),
  };
}

/** Lê tanto totalCIA quanto pontosCIA (compat com telas antigas) */
export function totalsCompatFromTotais(totais: unknown): TotaisCompat {
  const t = (typeof totais === "object" && totais) ? (totais as Record<string, unknown>) : {};
  const totalPtsRaw = num(t.totalCIA ?? t.pontosCIA);
  const totalPts = Math.round(totalPtsRaw);
  const custoTotal = num(t.custoTotal ?? 0);
  const custoMilheiro =
    num(t.custoMilheiroTotal) > 0
      ? num(t.custoMilheiroTotal)
      : totalPts > 0
      ? custoTotal / (totalPts / 1000)
      : 0;
  const lucroTotal = num(t.lucroTotal ?? 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/**
 * smartTotals: consolida totais com fallback.
 * - Se veio objeto `totais` compatível, normaliza por totalsCompatFromTotais
 * - Senão, soma a partir de `ItemLinha[]` (engine-first)
 */
export function smartTotals(itensRaw: unknown[], totais?: unknown): TotaisCompat {
  if (hasCompatKeys(totais)) {
    return totalsCompatFromTotais(totais);
  }
  const itens: ItemLinha[] = Array.isArray(itensRaw) ? (itensRaw as ItemLinha[]) : [];
  let totalPts = 0;
  let custoTotal = 0;

  for (const it of itens) {
    totalPts += contribCIA(it);
    custoTotal += valorItem(it);
  }
  const custoMilheiro = totalPts > 0 ? custoTotal / (totalPts / 1000) : 0;

  // Sem metaMilheiro aqui, lucroTotal permanece 0 (compat com UI antiga)
  return { totalPts, custoTotal, custoMilheiro, lucroTotal: 0 };
}
