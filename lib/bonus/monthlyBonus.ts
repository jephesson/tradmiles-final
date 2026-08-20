export type EmployeeBonusMetrics = {
  userId: string;
  name: string;
  login: string;
  c2Cents: number;
  salesVolumeCents: number;
  salesCount: number;
  finalizedAccounts: number;
};

export type BonusShareBreakdown = {
  c2ShareCents: number;
  volumeShareCents: number;
  accountsShareCents: number;
  equalShareCents: number;
};

export type BonusDistributionRow = {
  userId: string;
  name: string;
  login: string;
  metrics: Pick<
    EmployeeBonusMetrics,
    "c2Cents" | "salesVolumeCents" | "salesCount" | "finalizedAccounts"
  >;
  shares: BonusShareBreakdown;
  grossBonusCents: number;
  taxCents: number;
  netBonusCents: number;
  isWinnerC2: boolean;
  isWinnerVolume: boolean;
  isWinnerAccounts: boolean;
};

export type MonthlyBonusPreview = {
  month: string;
  isActive: boolean;
  revenueGoalCents: number;
  profitGoalCents: number;
  revenueCents: number;
  profitCents: number;
  revenueGoalMet: boolean;
  profitGoalMet: boolean;
  poolFromRevenueCents: number;
  poolFromProfitCents: number;
  totalPoolCents: number;
  eligibleCount: number;
  distributions: BonusDistributionRow[];
};

const REVENUE_BPS = 10; // 0,1% = 10 bps
const PROFIT_BPS = 10;

export function isMonthISO(v: string) {
  return /^\d{4}-\d{2}$/.test(String(v || "").trim());
}

export function monthStartDate(month: string) {
  return `${month}-01`;
}

export function nextMonthStartDate(month: string) {
  const [yRaw, mRaw] = month.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!y || !m) return "9999-12-01";
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export function monthLabelPT(month: string) {
  const [y, m] = month.split("-");
  const names = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return month;
  return `${names[idx]}/${y}`;
}

export function currentMonthISORecife() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(d)
    .reduce((acc: Record<string, string>, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}`;
}

export function previousMonthISO(month: string) {
  const [yRaw, mRaw] = month.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!y || !m) return month;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

export function isFirstDayOfMonth(dateISO: string) {
  return /^\d{4}-\d{2}-01$/.test(String(dateISO || "").trim());
}

export function computePoolParts(
  revenueCents: number,
  profitCents: number,
  revenueGoalMet: boolean,
  profitGoalMet: boolean
) {
  const poolFromRevenueCents = revenueGoalMet
    ? Math.round(Math.max(0, revenueCents) * (REVENUE_BPS / 10000))
    : 0;
  const poolFromProfitCents =
    revenueGoalMet && profitGoalMet
      ? Math.round(Math.max(0, profitCents) * (PROFIT_BPS / 10000))
      : 0;
  return {
    poolFromRevenueCents,
    poolFromProfitCents,
    totalPoolCents: poolFromRevenueCents + poolFromProfitCents,
  };
}

function winnersByMetric(
  metrics: EmployeeBonusMetrics[],
  key: "c2Cents" | "salesVolumeCents" | "finalizedAccounts",
  eligibleUserIds: string[]
) {
  if (metrics.length === 0) return [] as string[];
  const max = Math.max(...metrics.map((m) => m[key]));
  if (max <= 0) return eligibleUserIds;
  return metrics.filter((m) => m[key] === max).map((m) => m.userId);
}

function splitPoolPart(poolPartCents: number, winnerIds: string[]) {
  if (poolPartCents <= 0 || winnerIds.length === 0) return new Map<string, number>();
  const base = Math.floor(poolPartCents / winnerIds.length);
  let remainder = poolPartCents - base * winnerIds.length;
  const out = new Map<string, number>();
  for (const id of winnerIds) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    out.set(id, base + extra);
  }
  return out;
}

export function taxByPercent(cents: number, percent: number) {
  return Math.round(Math.max(0, cents) * (percent / 100));
}

export function distributeMonthlyBonus(args: {
  month: string;
  isActive: boolean;
  revenueGoalCents: number;
  profitGoalCents: number;
  revenueCents: number;
  profitCents: number;
  metrics: EmployeeBonusMetrics[];
  eligibleUserIds: string[];
  taxPercent: number;
}): MonthlyBonusPreview {
  const revenueGoalMet = args.revenueCents >= args.revenueGoalCents && args.revenueGoalCents > 0;
  const profitGoalMet = args.profitCents >= args.profitGoalCents && args.profitGoalCents > 0;

  const pools = computePoolParts(
    args.revenueCents,
    args.profitCents,
    revenueGoalMet,
    profitGoalMet
  );

  const eligible =
    args.eligibleUserIds.length > 0
      ? args.eligibleUserIds
      : args.metrics.map((m) => m.userId);

  const empty: MonthlyBonusPreview = {
    month: args.month,
    isActive: args.isActive,
    revenueGoalCents: args.revenueGoalCents,
    profitGoalCents: args.profitGoalCents,
    revenueCents: args.revenueCents,
    profitCents: args.profitCents,
    revenueGoalMet,
    profitGoalMet,
    ...pools,
    eligibleCount: eligible.length,
    distributions: eligible.map((userId) => {
      const m = args.metrics.find((x) => x.userId === userId);
      return {
        userId,
        name: m?.name || "—",
        login: m?.login || "—",
        metrics: {
          c2Cents: m?.c2Cents || 0,
          salesVolumeCents: m?.salesVolumeCents || 0,
          salesCount: m?.salesCount || 0,
          finalizedAccounts: m?.finalizedAccounts || 0,
        },
        shares: {
          c2ShareCents: 0,
          volumeShareCents: 0,
          accountsShareCents: 0,
          equalShareCents: 0,
        },
        grossBonusCents: 0,
        taxCents: 0,
        netBonusCents: 0,
        isWinnerC2: false,
        isWinnerVolume: false,
        isWinnerAccounts: false,
      };
    }),
  };

  if (!args.isActive || !revenueGoalMet || pools.totalPoolCents <= 0 || eligible.length === 0) {
    return empty;
  }

  const c2Winners = winnersByMetric(args.metrics, "c2Cents", eligible);
  const volumeWinners = winnersByMetric(args.metrics, "salesVolumeCents", eligible);
  const accountsWinners = winnersByMetric(args.metrics, "finalizedAccounts", eligible);

  const c2Map = splitPoolPart(Math.round(pools.totalPoolCents * 0.3), c2Winners);
  const volumeMap = splitPoolPart(Math.round(pools.totalPoolCents * 0.3), volumeWinners);
  const accountsMap = splitPoolPart(Math.round(pools.totalPoolCents * 0.2), accountsWinners);
  const equalMap = splitPoolPart(Math.round(pools.totalPoolCents * 0.2), eligible);

  const distributions = eligible.map((userId) => {
    const m = args.metrics.find((x) => x.userId === userId);
    const shares: BonusShareBreakdown = {
      c2ShareCents: c2Map.get(userId) || 0,
      volumeShareCents: volumeMap.get(userId) || 0,
      accountsShareCents: accountsMap.get(userId) || 0,
      equalShareCents: equalMap.get(userId) || 0,
    };
    const grossBonusCents =
      shares.c2ShareCents +
      shares.volumeShareCents +
      shares.accountsShareCents +
      shares.equalShareCents;
    const taxCents = taxByPercent(grossBonusCents, args.taxPercent);
    const netBonusCents = grossBonusCents - taxCents;

    return {
      userId,
      name: m?.name || "—",
      login: m?.login || "—",
      metrics: {
        c2Cents: m?.c2Cents || 0,
        salesVolumeCents: m?.salesVolumeCents || 0,
        salesCount: m?.salesCount || 0,
        finalizedAccounts: m?.finalizedAccounts || 0,
      },
      shares,
      grossBonusCents,
      taxCents,
      netBonusCents,
      isWinnerC2: c2Winners.includes(userId),
      isWinnerVolume: volumeWinners.includes(userId),
      isWinnerAccounts: accountsWinners.includes(userId),
    };
  });

  return {
    ...empty,
    ...pools,
    distributions,
  };
}

export function suggestGoalsFromMax(maxRevenueCents: number, maxProfitCents: number) {
  return {
    revenueGoalCents: Math.round(Math.max(0, maxRevenueCents) * 1.1),
    profitGoalCents: Math.round(Math.max(0, maxProfitCents) * 1.1),
  };
}

export function daysInMonthFromKey(month: string): number {
  const [yRaw, mRaw] = month.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/** Dias restantes no mês civil, incluindo hoje. */
export function daysRemainingInMonth(month: string, todayISO: string): number {
  const m = todayISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m || `${m[1]}-${m[2]}` !== month) return 0;
  const day = Number(m[3]);
  const dim = daysInMonthFromKey(month);
  return Math.max(0, dim - day + 1);
}

/** Média diária de faturamento (PV sem taxa + balcão) para bater a meta de bônus. */
export function computeDailyRevenueTargetCents(args: {
  revenueGoalCents: number;
  revenueCents: number;
  daysRemaining: number;
}): number {
  const goal = Math.max(0, args.revenueGoalCents);
  const current = Math.max(0, args.revenueCents);
  if (goal <= 0 || current >= goal) return 0;
  const days = Math.max(1, args.daysRemaining);
  return Math.ceil((goal - current) / days);
}
