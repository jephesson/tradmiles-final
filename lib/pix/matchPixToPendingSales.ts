import { employeeNameMatch, namesLikelyMatch, normalizeName, sharedNameTokens } from "./normalizeName";
import type { ParsedPixEmail, PixClassification, PixMatchResult, PixMatchSale } from "./types";

const COMPANY_CNPJ = "63817773000185";
const COMPANY_NAMES = ["vias aereas", "vias aéreas", "vias aereo", "trade miles", "trademiles"];

/** Aceita diferença de até R$ 2,00 (centavos, IOF, arredondamento). */
export const AMOUNT_CLOSE_CENTS = 200;

/** Pagador conhecido / nome: até 0,8% do Pix ou R$ 30 (taxa, desconto, arredondamento). */
export function groupAmountTolerance(targetCents: number, preferred: boolean) {
  if (!preferred) return AMOUNT_CLOSE_CENTS;
  const pct = Math.round(Math.abs(targetCents) * 0.008);
  return Math.max(AMOUNT_CLOSE_CENTS, Math.min(3000, pct));
}

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

function amountClose(a: number, b: number, tol = AMOUNT_CLOSE_CENTS) {
  return Math.abs(a - b) <= tol;
}

function groupByCliente(sales: PendingSaleLite[]) {
  const map = new Map<string, PendingSaleLite[]>();
  for (const s of sales) {
    const arr = map.get(s.clienteId) || [];
    arr.push(s);
    map.set(s.clienteId, arr);
  }
  return map;
}

/**
 * Soma (ou subconjunto) das vendas pendentes do mesmo cliente ≈ valor do Pix.
 * Prioriza: soma total do cliente → depois subconjunto.
 */
function findClienteGroupedMatch(
  sales: PendingSaleLite[],
  target: number,
  preferClienteIds?: Set<string>
): PendingSaleLite[] | null {
  const byCliente = groupByCliente(sales);
  type Cand = { sales: PendingSaleLite[]; diff: number; fullGroup: boolean; preferred: boolean };
  const cands: Cand[] = [];

  for (const [clienteId, list] of byCliente) {
    if (list.length < 1) continue;
    const preferred = preferClienteIds?.has(clienteId) ?? false;
    const tol = groupAmountTolerance(target, preferred);
    const fullSum = list.reduce((a, s) => a + s.totalCents, 0);
    const fullDiff = Math.abs(fullSum - target);

    if (list.length >= 2 && fullDiff <= tol) {
      cands.push({ sales: list, diff: fullDiff, fullGroup: true, preferred });
      continue;
    }

    if (list.length >= 2) {
      const subset = subsetSumClose(list, target, Math.min(12, list.length), tol);
      if (subset && subset.length >= 2) {
        const sum = subset.reduce((a, s) => a + s.totalCents, 0);
        cands.push({
          sales: subset,
          diff: Math.abs(sum - target),
          fullGroup: false,
          preferred,
        });
      }
    }
  }

  if (!cands.length) return null;

  cands.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    if (a.fullGroup !== b.fullGroup) return a.fullGroup ? -1 : 1;
    if (a.diff !== b.diff) return a.diff - b.diff;
    return b.sales.length - a.sales.length;
  });

  return cands[0]!.sales;
}

function subsetSumClose(
  items: PendingSaleLite[],
  target: number,
  maxItems = 10,
  tol = AMOUNT_CLOSE_CENTS
): PendingSaleLite[] | null {
  if (items.length > maxItems) {
    items = [...items]
      .sort((a, b) => b.date.getTime() - a.date.getTime() || b.totalCents - a.totalCents)
      .slice(0, maxItems);
  }
  const n = items.length;
  let best: PendingSaleLite[] | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  function backtrack(idx: number, sum: number, picked: PendingSaleLite[]) {
    const diff = Math.abs(sum - target);
    if (picked.length >= 2 && diff < bestDiff && diff <= tol) {
      bestDiff = diff;
      best = [...picked];
    }
    if (idx >= n || sum > target + tol) return;
    backtrack(idx + 1, sum + items[idx]!.totalCents, [...picked, items[idx]!]);
    backtrack(idx + 1, sum, picked);
  }

  backtrack(0, 0, []);
  return best;
}

function mapSale(s: PendingSaleLite, pixAmount: number, reason: string, groupMatched = false): PixMatchSale {
  return {
    saleId: s.id,
    numero: s.numero,
    locator: s.locator,
    totalCents: s.totalCents,
    clienteId: s.clienteId,
    clienteNome: s.clienteNome,
    date: s.date.toISOString(),
    program: s.program,
    // Em grupo que bate, não mostrar "vs Pix" por venda isolada
    amountDiffCents: groupMatched ? 0 : pixAmount - s.totalCents,
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

function reasonFor(sale: PendingSaleLite, parsed: ParsedPixEmail, learned: boolean, grouped = false) {
  const diff = parsed.amountCents - sale.totalCents;
  const parts: string[] = [];
  if (grouped) parts.push("agrupada com outras do mesmo cliente");
  if (learned) parts.push("pagador já vinculado a este cliente");
  if (namesLikelyMatch(parsed.payerName || "", sale.clienteNome)) parts.push("nome parecido");
  else if (sharedNameTokens(parsed.payerName || "", sale.clienteNome).length) {
    parts.push("parte do nome em comum");
  }
  if (!grouped) {
    if (diff === 0) parts.push("valor igual");
    else if (Math.abs(diff) <= AMOUNT_CLOSE_CENTS) {
      parts.push(`diferença de ${fmtMoney(Math.abs(diff))}`);
    } else {
      parts.push(`valor pendente ${fmtMoney(sale.totalCents)}`);
    }
  } else {
    parts.push(`valor pendente ${fmtMoney(sale.totalCents)}`);
  }
  return parts.join(" · ");
}

function groupedResult(
  grouped: PendingSaleLite[],
  parsed: ParsedPixEmail,
  learnedClienteIds: Set<string>
): PixMatchResult {
  const total = grouped.reduce((a, s) => a + s.totalCents, 0);
  const clienteNome = grouped[0]?.clienteNome || "cliente";
  const diff = parsed.amountCents - total;
  const diffLabel =
    diff === 0
      ? "soma igual ao Pix"
      : `soma ${fmtMoney(total)} · diferença de ${fmtMoney(Math.abs(diff))}`;
  return {
    classification: "CLIENT_PAYMENT",
    classificationLabel: `Pix agrupado · ${clienteNome} (${grouped.length} vendas, ${diffLabel})`,
    suggestedSales: grouped.map((s) =>
      mapSale(
        s,
        parsed.amountCents,
        reasonFor(s, parsed, learnedClienteIds.has(s.clienteId), true),
        true
      )
    ),
    matchKind: "grouped",
    matchedTotalCents: total,
    amountDiffCents: parsed.amountCents - total,
    employeeName: null,
  };
}

function alreadyPaidResult(sale: PendingSaleLite, parsed: ParsedPixEmail): PixMatchResult {
  const saleView = mapSale(sale, parsed.amountCents, "já marcada como paga");
  return {
    classification: "CLIENT_PAYMENT",
    classificationLabel: `Já está pago — ${sale.numero} · ${sale.clienteNome}`,
    suggestedSales: [],
    matchKind: "already_paid",
    matchedTotalCents: sale.totalCents,
    amountDiffCents: parsed.amountCents - sale.totalCents,
    employeeName: null,
    alreadyPaidSale: saleView,
  };
}

function findPaidMatch(
  paidSales: PendingSaleLite[],
  parsed: ParsedPixEmail,
  learnedClienteIds: Set<string>
): PendingSaleLite | null {
  const payer = parsed.payerName || "";
  if (!paidSales.length || parsed.amountCents <= 0) return null;

  const related = paidSales.filter(
    (s) => learnedClienteIds.has(s.clienteId) || namesLikelyMatch(payer, s.clienteNome)
  );
  if (!related.length) return null;

  return (
    related.find((s) => s.totalCents === parsed.amountCents) ||
    related.find((s) => amountClose(s.totalCents, parsed.amountCents)) ||
    null
  );
}

export function classifyAndMatchPix(args: {
  parsed: ParsedPixEmail;
  pendingSales: PendingSaleLite[];
  employees: EmployeeLite[];
  learnedAliases?: LearnedAlias[];
  paidSales?: PendingSaleLite[];
}): PixMatchResult {
  const { parsed, pendingSales, employees, learnedAliases = [], paidSales = [] } = args;
  const payer = parsed.payerName || "";
  const payerNorm = normalizeName(payer);
  const learnedClienteIds = new Set(
    learnedAliases.filter((a) => a.payerNameNorm === payerNorm).map((a) => a.clienteId)
  );

  if (parsed.direction === "OUT") {
    const dest = payer.trim();
    const toCompany =
      COMPANY_NAMES.some((n) => payerNorm.includes(n)) || payerNorm.includes(COMPANY_CNPJ);
    return {
      classification: "COMPANY_INTERNAL",
      classificationLabel: dest
        ? toCompany
          ? `Pix enviado para ${dest} (interno)`
          : `Pix enviado para ${dest}`
        : "Pix enviado (saída)",
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
  const preferClienteIds = new Set([
    ...learnedClienteIds,
    ...byName.map((s) => s.clienteId),
  ]);

  // 1) Venda única com valor exato (pagador conhecido / nome — não outro cliente com o mesmo valor)
  const exactPool = byLearned.length ? byLearned : byName;
  const exact = exactPool.find((s) => s.totalCents === parsed.amountCents);
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

  // 2) Agrupamento por cliente (soma das pendências = Pix) — antes de nome fraco / venda isolada
  const clienteGroup = findClienteGroupedMatch(pendingSales, parsed.amountCents, preferClienteIds);
  if (clienteGroup?.length) {
    return groupedResult(clienteGroup, parsed, learnedClienteIds);
  }

  // 3) Venda única com valor próximo (só no pagador conhecido / nome — não pega outro pendente solto)
  const closePool = byLearned.length ? byLearned : byName;
  const close = closePool.find((s) => amountClose(s.totalCents, parsed.amountCents));
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

  // 3b) Sem pendente que bata: se já marcaram como pago, avisa e NÃO procura outro
  const paidHit = findPaidMatch(paidSales, parsed, learnedClienteIds);
  if (paidHit) {
    return alreadyPaidResult(paidHit, parsed);
  }

  // 4) Subconjunto em pool aprendido / nome
  for (const pool of [byLearned, byName]) {
    if (pool.length < 2) continue;
    const preferred = pool === byLearned || pool === byName;
    const grouped = subsetSumClose(
      pool,
      parsed.amountCents,
      Math.min(12, pool.length),
      groupAmountTolerance(parsed.amountCents, preferred)
    );
    if (grouped?.length) {
      return groupedResult(grouped, parsed, learnedClienteIds);
    }
  }

  // Pagador conhecido com pendências: mostra as vendas e deixa a IA decidir o recorte.
  // Não tratar como "já pago" — isso impedia sugerir o lote do mesmo cliente.
  if (learnedClienteIds.size && byLearned.length) {
    const sum = byLearned.reduce((a, s) => a + s.totalCents, 0);
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: "Pagador conhecido — confira quais vendas este Pix cobre",
      suggestedSales: byLearned
        .slice(0, 12)
        .map((s) => mapSale(s, parsed.amountCents, reasonFor(s, parsed, true))),
      matchKind: "name_only",
      matchedTotalCents: sum,
      amountDiffCents: parsed.amountCents - sum,
      employeeName: null,
    };
  }

  if (learnedClienteIds.size) {
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel:
        "Pagador conhecido — nenhuma pendência com este valor (confira se já foi baixado)",
      suggestedSales: [],
      matchKind: "already_paid",
      matchedTotalCents: 0,
      amountDiffCents: parsed.amountCents,
      employeeName: null,
      alreadyPaidSale: null,
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
