/** Multa de cancelamento por CPF (adulto/criança; bebê não conta — já fora de Sale.passengers). */

export function defaultCancelFinePerPaxCents(program: string): number {
  const p = String(program || "").toUpperCase();
  if (p === "LATAM") return 15_000; // R$ 150
  if (p === "SMILES") return 10_000; // R$ 100
  return 0;
}

export function cancelFinePaxCount(passengers: number): number {
  return Math.max(0, Math.trunc(Number(passengers) || 0));
}

export function computeCancelFineTotalCents(args: {
  perPaxCents: number;
  passengers: number;
}): number {
  const pax = cancelFinePaxCount(args.passengers);
  const per = Math.max(0, Math.trunc(Number(args.perPaxCents) || 0));
  return per * pax;
}

type SaleFineLike = {
  paymentStatus?: string | null;
  cancelFineCents?: number | null;
  receivable?: { status?: string | null; balanceCents?: number | null } | null;
};

export function saleHasUnpaidCancelFine(s: SaleFineLike) {
  if (String(s.paymentStatus || "") !== "CANCELED") return false;
  if (Math.max(0, Math.trunc(Number(s.cancelFineCents) || 0)) <= 0) return false;
  const rec = s.receivable;
  if (!rec) return true;
  if (String(rec.status || "") === "RECEIVED") return false;
  if (typeof rec.balanceCents === "number") return rec.balanceCents > 0;
  return String(rec.status || "") === "OPEN";
}
