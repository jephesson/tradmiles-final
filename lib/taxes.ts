export const TAX_TZ = "America/Recife";

export type TaxPaymentEntry = {
  id: string;
  amountCents: number;
  paidAt: string;
  paidById: string | null;
  paidByName?: string | null;
  kind?: "PARTIAL" | "FULL";
};

export function safeTaxInt(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function monthKeyTZ(date = new Date(), timeZone = TAX_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  return `${y}-${m}`; // YYYY-MM
}

export function isValidMonthKey(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

export function monthIsPayable(month: string, currentMonth: string) {
  // "YYYY-MM" funciona lexicograficamente
  return month < currentMonth;
}

export function fmtMonthPTBR(month: string) {
  const [y, m] = month.split("-");
  return `${m}/${y}`;
}

export function taxPaymentEntriesFromBreakdown(breakdown: unknown): TaxPaymentEntry[] {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return [];

  const raw = breakdown as Record<string, unknown>;
  if (!Array.isArray(raw.payments)) return [];

  const entries: TaxPaymentEntry[] = [];
  raw.payments.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const item = entry as Record<string, unknown>;
    const amountCents = safeTaxInt(item.amountCents);
    if (amountCents <= 0) return;

    entries.push({
      id: String(item.id || `legacy-${index}`),
      amountCents,
      paidAt: String(item.paidAt || ""),
      paidById: item.paidById == null ? null : String(item.paidById),
      paidByName: item.paidByName == null ? null : String(item.paidByName),
      kind: item.kind === "FULL" ? "FULL" : "PARTIAL",
    });
  });

  return entries;
}

export function partialTaxPaidCentsFromBreakdown(breakdown: unknown) {
  if (!breakdown || typeof breakdown !== "object" || Array.isArray(breakdown)) return 0;

  const raw = breakdown as Record<string, unknown>;
  const entriesTotal = taxPaymentEntriesFromBreakdown(breakdown).reduce(
    (acc, entry) => acc + entry.amountCents,
    0
  );
  const denormalizedTotal = safeTaxInt(raw.paidCents);

  return Math.max(0, entriesTotal, denormalizedTotal);
}

export function taxPaidCentsFromPayment(payment?: {
  totalTaxCents: unknown;
  breakdown: unknown;
  paidAt?: Date | string | null;
} | null) {
  if (!payment) return 0;
  if (payment.paidAt) return Math.max(0, safeTaxInt(payment.totalTaxCents));
  return partialTaxPaidCentsFromBreakdown(payment.breakdown);
}

export function taxPendingCents(totalTaxCents: unknown, paidCents: unknown) {
  return Math.max(0, safeTaxInt(totalTaxCents) - safeTaxInt(paidCents));
}

export function buildTaxBreakdownSnapshot(args: {
  existingBreakdown?: unknown;
  payoutBreakdown: unknown[];
  payoutTaxCents: number;
  balcaoTaxCents: number;
  balcaoOperationsCount: number;
  paymentEntry?: TaxPaymentEntry | null;
}) {
  const existing =
    args.existingBreakdown && typeof args.existingBreakdown === "object" && !Array.isArray(args.existingBreakdown)
      ? (args.existingBreakdown as Record<string, unknown>)
      : {};

  const payments = [...taxPaymentEntriesFromBreakdown(existing), ...(args.paymentEntry ? [args.paymentEntry] : [])];
  const paidCents = payments.reduce((acc, entry) => acc + entry.amountCents, 0);

  return {
    ...existing,
    payoutBreakdown: args.payoutBreakdown,
    components: {
      payoutTaxCents: args.payoutTaxCents,
      balcaoTaxCents: args.balcaoTaxCents,
      balcaoOperationsCount: args.balcaoOperationsCount,
    },
    payments,
    paidCents,
  };
}
