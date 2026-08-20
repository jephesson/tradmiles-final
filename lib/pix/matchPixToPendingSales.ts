import { employeeNameMatch, namesLikelyMatch, normalizeName, sharedNameTokens } from "./normalizeName";
import type { ParsedPixEmail, PixClassification, PixMatchResult, PixMatchSale } from "./types";

const COMPANY_CNPJ = "63817773000185";
const COMPANY_NAMES = ["vias aereas", "vias aéreas", "vias aereo", "trade miles", "trademiles"];

/** Aceita diferença de até R$ 2,00 (centavos, IOF, arredondamento). */
export const AMOUNT_CLOSE_CENTS = 200;

type EmployeeLite = { id: string; name: string };
export type PendingSaleLite = {
  id: string;
  numero: string;
  locator: string | null;
  totalCents: number;
  clienteId: string;
  clienteNome: string;
  date: Date;
  program: string;
};

export type LearnedAlias = { payerNameNorm: string; clienteId: string };

function fmtMoney(cents: number) {
  return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function amountClose(a: number, b: number) {
  return Math.abs(a - b) <= AMOUNT_CLOSE_CENTS;
}

function subsetSumClose(
  items: PendingSaleLite[],
  target: number,
  maxItems = 10
): PendingSaleLite[] | null {
  if (items.length > maxItems) items = items.slice(0, maxItems);
  const n = items.length;
  let best: PendingSaleLite[] | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  function backtrack(idx: number, sum: number, picked: PendingSaleLite[]) {
    const diff = Math.abs(sum - target);
    if (picked.length && diff < bestDiff && diff <= AMOUNT_CLOSE_CENTS) {
      bestDiff = diff;
      best = [...picked];
    }
    if (idx >= n || sum > target + AMOUNT_CLOSE_CENTS) return;
    backtrack(idx + 1, sum + items[idx]!.totalCents, [...picked, items[idx]!]);
    backtrack(idx + 1, sum, picked);
  }

  backtrack(0, 0, []);
  return best;
}

function mapSale(s: PendingSaleLite, pixAmount: number, reason: string): PixMatchSale {
  return {
    saleId: s.id,
    numero: s.numero,
    locator: s.locator,
    totalCents: s.totalCents,
    clienteId: s.clienteId,
    clienteNome: s.clienteNome,
    date: s.date.toISOString(),
    program: s.program,
    amountDiffCents: pixAmount - s.totalCents,
    reason,
  };
}

function nameOverlapScore(payer: string, cliente: string) {
  return sharedNameTokens(payer, cliente).length;
}

function rankProbable(pendingSales: PendingSaleLite[], parsed: ParsedPixEmail, learnedClienteIds: Set<string>) {
  const payer = parsed.payerName || "";
  return [...pendingSales]
    .map((s) => {
      const diff = Math.abs(s.totalCents - parsed.amountCents);
      let score = 0;
      if (diff === 0) score += 80;
      else if (diff <= 60) score += 70;
      else if (diff <= AMOUNT_CLOSE_CENTS) score += 55;
      else score += Math.max(0, 25 - Math.floor(diff / 100));

      const overlap = nameOverlapScore(payer, s.clienteNome);
      if (namesLikelyMatch(payer, s.clienteNome)) score += 40;
      else if (overlap) score += 20 * overlap;

      if (learnedClienteIds.has(s.clienteId)) score += 50;

      return { sale: s, score, diff };
    })
    .sort((a, b) => b.score - a.score || a.diff - b.diff)
    .slice(0, 4);
}

function reasonFor(sale: PendingSaleLite, parsed: ParsedPixEmail, learned: boolean) {
  const diff = parsed.amountCents - sale.totalCents;
  const parts: string[] = [];
  if (learned) parts.push("pagador já vinculado a este cliente");
  if (namesLikelyMatch(parsed.payerName || "", sale.clienteNome)) parts.push("nome parecido");
  else if (sharedNameTokens(parsed.payerName || "", sale.clienteNome).length) {
    parts.push("parte do nome em comum");
  }
  if (diff === 0) parts.push("valor igual");
  else if (Math.abs(diff) <= AMOUNT_CLOSE_CENTS) {
    parts.push(`diferença de ${fmtMoney(Math.abs(diff))}`);
  } else {
    parts.push(`valor pendente ${fmtMoney(sale.totalCents)}`);
  }
  return parts.join(" · ");
}

export function classifyAndMatchPix(args: {
  parsed: ParsedPixEmail;
  pendingSales: PendingSaleLite[];
  employees: EmployeeLite[];
  learnedAliases?: LearnedAlias[];
}): PixMatchResult {
  const { parsed, pendingSales, employees, learnedAliases = [] } = args;
  const payer = parsed.payerName || "";
  const payerNorm = normalizeName(payer);
  const learnedClienteIds = new Set(
    learnedAliases.filter((a) => a.payerNameNorm === payerNorm).map((a) => a.clienteId)
  );

  if (parsed.direction === "OUT") {
    return {
      classification: "COMPANY_INTERNAL",
      classificationLabel: "Pix enviado (saída)",
      suggestedSales: [],
      matchKind: "none",
      matchedTotalCents: 0,
      amountDiffCents: parsed.amountCents,
      employeeName: null,
    };
  }

  if (
    COMPANY_NAMES.some((n) => payerNorm.includes(n)) ||
    payerNorm.includes(COMPANY_CNPJ)
  ) {
    return {
      classification: "COMPANY_INTERNAL",
      classificationLabel: "Pix interno / empresa",
      suggestedSales: [],
      matchKind: "none",
      matchedTotalCents: 0,
      amountDiffCents: parsed.amountCents,
      employeeName: null,
    };
  }

  const closeSales = pendingSales.filter((s) => amountClose(s.totalCents, parsed.amountCents));
  const employeeHit = employees.find((e) => employeeNameMatch(payer, e.name));
  const tinyPix = parsed.amountCents < 100;

  if (tinyPix && !employeeHit && !closeSales.length) {
    return {
      classification: "UNKNOWN",
      classificationLabel: "Valor simbólico — confira manualmente",
      suggestedSales: [],
      matchKind: "none",
      matchedTotalCents: 0,
      amountDiffCents: parsed.amountCents,
      employeeName: null,
    };
  }

  if (employeeHit && (tinyPix || !closeSales.length)) {
    return {
      classification: "EMPLOYEE",
      classificationLabel: `Funcionário: ${employeeHit.name}`,
      suggestedSales: [],
      matchKind: "none",
      matchedTotalCents: 0,
      amountDiffCents: parsed.amountCents,
      employeeName: employeeHit.name,
    };
  }

  const byLearned = pendingSales.filter((s) => learnedClienteIds.has(s.clienteId));
  const byName = pendingSales.filter((s) => namesLikelyMatch(payer, s.clienteNome));
  const pool = byLearned.length ? byLearned : byName.length ? byName : pendingSales;

  const exact = pool.find((s) => s.totalCents === parsed.amountCents)
    || pendingSales.find((s) => s.totalCents === parsed.amountCents);
  if (exact) {
    const learned = learnedClienteIds.has(exact.clienteId);
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: learned
        ? "Pagador conhecido — venda com valor igual"
        : "Provável pagamento de cliente (valor igual)",
      suggestedSales: [mapSale(exact, parsed.amountCents, reasonFor(exact, parsed, learned))],
      matchKind: learned ? "learned" : "exact",
      matchedTotalCents: exact.totalCents,
      amountDiffCents: 0,
      employeeName: null,
    };
  }

  const close = pool.find((s) => amountClose(s.totalCents, parsed.amountCents))
    || pendingSales.find((s) => amountClose(s.totalCents, parsed.amountCents));
  if (close) {
    const diff = parsed.amountCents - close.totalCents;
    const learned = learnedClienteIds.has(close.clienteId);
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: `Mais provável: ${close.clienteNome} (diferença de ${fmtMoney(Math.abs(diff))})`,
      suggestedSales: [mapSale(close, parsed.amountCents, reasonFor(close, parsed, learned))],
      matchKind: learned ? "learned" : "close_amount",
      matchedTotalCents: close.totalCents,
      amountDiffCents: diff,
      employeeName: null,
    };
  }

  const grouped = subsetSumClose(pool, parsed.amountCents);
  if (grouped?.length) {
    const total = grouped.reduce((a, s) => a + s.totalCents, 0);
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: `Pix agrupado (${grouped.length} vendas)`,
      suggestedSales: grouped.map((s) => mapSale(s, parsed.amountCents, reasonFor(s, parsed, learnedClienteIds.has(s.clienteId)))),
      matchKind: "grouped",
      matchedTotalCents: total,
      amountDiffCents: parsed.amountCents - total,
      employeeName: null,
    };
  }

  if (byLearned.length) {
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: "Pagador conhecido — confira o valor",
      suggestedSales: byLearned.slice(0, 5).map((s) => mapSale(s, parsed.amountCents, reasonFor(s, parsed, true))),
      matchKind: "learned",
      matchedTotalCents: byLearned.reduce((a, s) => a + s.totalCents, 0),
      amountDiffCents: parsed.amountCents - byLearned.reduce((a, s) => a + s.totalCents, 0),
      employeeName: null,
    };
  }

  if (byName.length) {
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: "Nome bate, valor diferente — confira manualmente",
      suggestedSales: byName.slice(0, 5).map((s) => mapSale(s, parsed.amountCents, reasonFor(s, parsed, false))),
      matchKind: "name_only",
      matchedTotalCents: byName.reduce((a, s) => a + s.totalCents, 0),
      amountDiffCents: parsed.amountCents - byName.reduce((a, s) => a + s.totalCents, 0),
      employeeName: null,
    };
  }

  const ranked = rankProbable(pendingSales, parsed, learnedClienteIds);
  const suggested = ranked
    .filter((r) => r.score >= 20 || r.diff <= 1500)
    .slice(0, 3)
    .map((r) => mapSale(r.sale, parsed.amountCents, reasonFor(r.sale, parsed, learnedClienteIds.has(r.sale.clienteId))));

  if (suggested.length) {
    const top = suggested[0]!;
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: `Mais provável: ${top.clienteNome}`,
      suggestedSales: suggested,
      matchKind: "probable",
      matchedTotalCents: top.totalCents,
      amountDiffCents: top.amountDiffCents,
      employeeName: null,
    };
  }

  return {
    classification: "UNKNOWN" as PixClassification,
    classificationLabel: "Pix desconhecido",
    suggestedSales: [],
    matchKind: "none",
    matchedTotalCents: 0,
    amountDiffCents: parsed.amountCents,
    employeeName: null,
  };
}
