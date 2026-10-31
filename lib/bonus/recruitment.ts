import { prisma } from "@/lib/prisma";
import { EXCLUDED_CPF_PREFIX } from "@/lib/cedentes/activeCedenteWhere";
import { brazilMonthBounds } from "@/lib/dates/brazilCalendar";
import { previousMonthISO } from "@/lib/bonus/monthlyBonus";

export type RecruitCedenteRow = {
  id: string;
  nomeCompleto: string;
  identificador: string;
  enteredAt: string;
};

export type RecruitByOwner = {
  userId: string;
  count: number;
  cedentes: RecruitCedenteRow[];
};

function enteredAtOf(c: { reviewedAt: Date | null; createdAt: Date }) {
  return c.reviewedAt || c.createdAt;
}

export async function listApprovedRecruitsInMonth(team: string, month: string) {
  const { start, end } = brazilMonthBounds(month);

  const [excluded, cedentes] = await Promise.all([
    prisma.cedenteExclusion.findMany({
      where: { team, scope: "ACCOUNT", restoredAt: null },
      select: { cedenteId: true },
    }),
    prisma.cedente.findMany({
      where: {
        status: "APPROVED",
        owner: { team },
        NOT: { cpf: { startsWith: EXCLUDED_CPF_PREFIX } },
        OR: [
          { reviewedAt: { gte: start, lt: end } },
          { AND: [{ reviewedAt: null }, { createdAt: { gte: start, lt: end } }] },
        ],
      },
      select: {
        id: true,
        nomeCompleto: true,
        identificador: true,
        reviewedAt: true,
        createdAt: true,
        ownerId: true,
      },
      orderBy: [{ reviewedAt: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const excludedIds = new Set(excluded.map((e) => e.cedenteId));
  const byOwner = new Map<string, RecruitByOwner>();

  for (const c of cedentes) {
    if (excludedIds.has(c.id)) continue;
    const row = byOwner.get(c.ownerId) || {
      userId: c.ownerId,
      count: 0,
      cedentes: [] as RecruitCedenteRow[],
    };
    row.count += 1;
    row.cedentes.push({
      id: c.id,
      nomeCompleto: c.nomeCompleto,
      identificador: c.identificador,
      enteredAt: enteredAtOf(c).toISOString(),
    });
    byOwner.set(c.ownerId, row);
  }

  return byOwner;
}

export async function countApprovedRecruitsByOwner(team: string, month: string) {
  const map = new Map<string, number>();
  const byOwner = await listApprovedRecruitsInMonth(team, month);
  for (const [userId, row] of byOwner) map.set(userId, row.count);
  return map;
}

export function recentRecruitMonths(asOfMonth: string, n = 6) {
  const out: string[] = [];
  let cur = asOfMonth;
  for (let i = 0; i < n; i++) {
    out.unshift(cur);
    cur = previousMonthISO(cur);
  }
  return out;
}
