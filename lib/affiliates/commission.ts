function safeInt(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function affiliateSaleCostCents(points: number, costPerKiloCents: number) {
  const pts = safeInt(points);
  const cost = safeInt(costPerKiloCents);
  if (pts <= 0 || cost <= 0) return 0;
  return Math.round((pts / 1000) * cost);
}

export function affiliateProfitBaseCents(args: {
  pointsValueCents: number;
  points: number;
  costPerKiloCents: number;
  bonusCents: number;
}) {
  const pointsValueCents = safeInt(args.pointsValueCents);
  const costCents = affiliateSaleCostCents(args.points, args.costPerKiloCents);
  const bonusCents = safeInt(args.bonusCents);
  return {
    costCents,
    profitCents: pointsValueCents - costCents - bonusCents,
  };
}

export function affiliateCommissionCents(args: {
  profitCents: number;
  commissionBps: number;
}) {
  const profitCents = Math.max(0, safeInt(args.profitCents));
  const commissionBps = Math.max(0, safeInt(args.commissionBps));
  if (profitCents <= 0 || commissionBps <= 0) return 0;
  return Math.round(profitCents * (commissionBps / 10000));
}

export function affiliateNetProfitAfterCommissionCents(args: {
  profitCents: number;
  affiliateCommissionCents: number;
}) {
  return safeInt(args.profitCents) - safeInt(args.affiliateCommissionCents);
}
