/** Emissão MAX: sobra de 0 a 2.000 pontos (fecha a conta com o mínimo possível). */
export function isMaxLeftover(leftoverPoints: number) {
  const n = Math.trunc(Number(leftoverPoints) || 0);
  return n >= 0 && n <= 2000;
}

/** Sem piso, ou pts/CPF da emissão ≥ piso, ou emissão MAX. */
export function saleMeetsCedenteMinPts(args: {
  minSellPtsPerPax?: number | null;
  pointsNeeded: number;
  passengersNeeded: number;
  leftoverPoints: number;
}) {
  const min = Math.max(0, Math.trunc(Number(args.minSellPtsPerPax) || 0));
  if (min <= 0) return true;
  if (isMaxLeftover(args.leftoverPoints)) return true;
  const pax = Math.max(0, Math.trunc(Number(args.passengersNeeded) || 0));
  if (pax <= 0) return false;
  const avg = Math.trunc(Number(args.pointsNeeded) || 0) / pax;
  return avg >= min;
}
