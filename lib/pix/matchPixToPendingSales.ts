import { namesLikelyMatch, normalizeName } from "./normalizeName";
import type { ParsedPixEmail, PixClassification, PixMatchResult } from "./types";

const COMPANY_CNPJ = "63817773000185";
const COMPANY_NAMES = ["vias aereas", "vias aéreas", "vias aereo", "trade miles", "trademiles"];

type EmployeeLite = { id: string; name: string };
type PendingSaleLite = {
  id: string;
  numero: string;
  locator: string | null;
  totalCents: number;
  clienteNome: string;
  date: Date;
  program: string;
};

function subsetSumExact(
  items: PendingSaleLite[],
  target: number,
  maxItems = 12
): PendingSaleLite[] | null {
  if (items.length > maxItems) items = items.slice(0, maxItems);
  const n = items.length;

  function backtrack(idx: number, sum: number, picked: PendingSaleLite[]): PendingSaleLite[] | null {
    if (sum === target) return picked;
    if (idx >= n || sum > target) return null;
    const withItem = backtrack(idx + 1, sum + items[idx]!.totalCents, [...picked, items[idx]!]);
    if (withItem) return withItem;
    return backtrack(idx + 1, sum, picked);
  }

  return backtrack(0, 0, []);
}

function mapSale(s: PendingSaleLite) {
  return {
    saleId: s.id,
    numero: s.numero,
    locator: s.locator,
    totalCents: s.totalCents,
    clienteNome: s.clienteNome,
    date: s.date.toISOString(),
    program: s.program,
  };
}

export function classifyAndMatchPix(args: {
  parsed: ParsedPixEmail;
  pendingSales: PendingSaleLite[];
  employees: EmployeeLite[];
}): PixMatchResult {
  const { parsed, pendingSales, employees } = args;
  const payer = parsed.payerName || "";

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

  const payerNorm = normalizeName(payer);
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

  const employeeHit = employees.find((e) => namesLikelyMatch(payer, e.name));
  if (employeeHit) {
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

  const byName = pendingSales.filter((s) => namesLikelyMatch(payer, s.clienteNome));
  const pool = byName.length ? byName : pendingSales;

  const exact = pool.find((s) => s.totalCents === parsed.amountCents);
  if (exact) {
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: "Provável pagamento de cliente",
      suggestedSales: [mapSale(exact)],
      matchKind: "exact",
      matchedTotalCents: exact.totalCents,
      amountDiffCents: 0,
      employeeName: null,
    };
  }

  const grouped = subsetSumExact(pool, parsed.amountCents);
  if (grouped?.length) {
    const total = grouped.reduce((a, s) => a + s.totalCents, 0);
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: `Pix agrupado (${grouped.length} vendas)`,
      suggestedSales: grouped.map(mapSale),
      matchKind: "grouped",
      matchedTotalCents: total,
      amountDiffCents: parsed.amountCents - total,
      employeeName: null,
    };
  }

  if (byName.length) {
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: "Nome bate, valor diferente — confira manualmente",
      suggestedSales: byName.slice(0, 5).map(mapSale),
      matchKind: "name_only",
      matchedTotalCents: byName.reduce((a, s) => a + s.totalCents, 0),
      amountDiffCents: parsed.amountCents - byName.reduce((a, s) => a + s.totalCents, 0),
      employeeName: null,
    };
  }

  const byAmount = pendingSales.filter((s) => s.totalCents === parsed.amountCents);
  if (byAmount.length) {
    return {
      classification: "CLIENT_PAYMENT",
      classificationLabel: "Valor bate, nome diferente — confira manualmente",
      suggestedSales: byAmount.slice(0, 5).map(mapSale),
      matchKind: "amount_only",
      matchedTotalCents: byAmount[0]!.totalCents,
      amountDiffCents: 0,
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
