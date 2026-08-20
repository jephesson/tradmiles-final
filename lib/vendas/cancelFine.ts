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
