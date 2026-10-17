export type DebtRateSlice = {
  effectiveFrom: string;
  dailyProfitBps: number;
};

export function bpsForDate(
  rates: DebtRateSlice[] | null | undefined,
  date: string,
  fallbackBps: number
) {
  const list = Array.isArray(rates) ? rates : [];
  let bps = fallbackBps;
  let from = "";
  for (const rate of list) {
    const day = String(rate.effectiveFrom || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > date) continue;
    if (day >= from) {
      from = day;
      bps = Number(rate.dailyProfitBps) || 0;
    }
  }
  return bps > 0 ? bps : fallbackBps > 0 ? fallbackBps : 10000;
}
