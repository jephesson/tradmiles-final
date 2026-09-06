import { SUGGEST_BELOW_BPS, saleTotalCents } from "@/lib/cotacao-passagens";

export type MixLegIn = {
  key: string;
  label: string;
  miles: number;
  feeCents: number;
  minMilheiroCents: number;
};

export type MixedQuote = {
  ciaLabel: string;
  miles: number;
  feeCents: number;
  idaRate: number;
  voltaRate: number;
  idaTotal: number;
  voltaTotal: number;
  total: number;
  floorTotal: number;
  targetCents: number;
  missesTarget: boolean;
  usedFloor: boolean;
};

export function cashTargetCents(cashCents: number) {
  if (cashCents <= 0) return 0;
  return Math.round((cashCents * (10000 - SUGGEST_BELOW_BPS)) / 10000);
}

export function rankLegCost(miles: number, feeCents: number, minMilheiroCents: number) {
  if (miles <= 0) return Number.POSITIVE_INFINITY;
  const rate = Math.max(0, minMilheiroCents);
  return saleTotalCents(miles, rate, feeCents) * 100000 + miles;
}

export function priceMixedQuote(cashCents: number, ida: MixLegIn, volta: MixLegIn | null): MixedQuote {
  const legs = volta ? [ida, volta] : [ida];
  const miles = legs.reduce((s, l) => s + l.miles, 0);
  const feeCents = legs.reduce((s, l) => s + l.feeCents, 0);
  const targetCents = cashTargetCents(cashCents);
  const floorTotal = legs.reduce(
    (s, l) => s + saleTotalCents(l.miles, Math.max(0, l.minMilheiroCents), l.feeCents),
    0
  );
  const sameKey = Boolean(volta && volta.key === ida.key);
  let bump = 0;
  const usedFloor = targetCents > 0 && floorTotal >= targetCents;
  if (targetCents > 0 && floorTotal < targetCents && miles > 0) {
    bump = Math.max(0, Math.round(((targetCents - floorTotal) / miles) * 1000));
  }
  const idaRate = Math.max(0, ida.minMilheiroCents) + bump;
  const voltaRate = volta ? Math.max(0, volta.minMilheiroCents) + bump : 0;
  const idaTotal = saleTotalCents(ida.miles, idaRate, ida.feeCents);
  const voltaTotal = volta ? saleTotalCents(volta.miles, voltaRate, volta.feeCents) : 0;
  const ciaLabel = !volta || sameKey ? ida.label : `${ida.label} + ${volta.label}`;
  return {
    ciaLabel,
    miles,
    feeCents,
    idaRate,
    voltaRate,
    idaTotal,
    voltaTotal,
    total: idaTotal + voltaTotal,
    floorTotal,
    targetCents,
    missesTarget: targetCents > 0 && floorTotal > targetCents,
    usedFloor,
  };
}
