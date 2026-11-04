import { prisma } from "@/lib/prisma";
import { recifeDateISOFrom, todayISORecife } from "@/lib/payouts/autoCompute";

export function uniqueRecifeDates(values: Array<Date | string | null | undefined>) {
  const today = todayISORecife();
  const out: string[] = [];
  for (const raw of values) {
    let date = "";
    if (raw instanceof Date && Number.isFinite(raw.getTime())) date = recifeDateISOFrom(raw);
    else if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) date = raw.trim();
    if (!date || date > today || out.includes(date)) continue;
    out.push(date);
  }
  return out;
}

export async function paidCommissionDatesForSale(args: {
  team: string;
  sellerId?: string | null;
  dates: string[];
}) {
  const dates = args.dates.filter(Boolean);
  if (!dates.length) return [] as string[];

  const rows = await prisma.employeePayout.findMany({
    where: {
      team: args.team,
      date: { in: dates },
      paidById: { not: null },
      ...(args.sellerId ? { userId: args.sellerId } : {}),
    },
    select: { date: true },
  });

  return Array.from(new Set(rows.map((r) => r.date)));
}
