/** Emissão MAX: sobra de 0 a 2.000 pontos (fecha a conta com o mínimo possível). */
export function isMaxLeftover(leftoverPoints: number) {
  const n = Math.trunc(Number(leftoverPoints) || 0);
  return n >= 0 && n <= 2000;
}

/** Sem piso, ou milheiro da venda ≥ piso, ou emissão MAX. */
export function saleMeetsCedenteMinMilheiro(args: {
  minSellMilheiroCents?: number | null;
  milheiroCents: number;
  leftoverPoints: number;
}) {
  const min = Math.max(0, Math.trunc(Number(args.minSellMilheiroCents) || 0));
  if (min <= 0) return true;
  if (isMaxLeftover(args.leftoverPoints)) return true;
  return Math.max(0, Math.trunc(Number(args.milheiroCents) || 0)) >= min;
}
