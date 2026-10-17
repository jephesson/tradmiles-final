import type { LoyaltyProgram } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function cedenteIdsExcludedFromProgram(program: LoyaltyProgram): Promise<string[]> {
  const rows = await prisma.cedenteExclusion.findMany({
    where: { scope: "PROGRAM", program, restoredAt: null },
    select: { cedenteId: true },
  });
  return [...new Set(rows.map((r) => r.cedenteId))];
}

export async function excludedProgramsByCedenteId(): Promise<Map<string, LoyaltyProgram[]>> {
  const rows = await prisma.cedenteExclusion.findMany({
    where: { scope: "PROGRAM", restoredAt: null, program: { not: null } },
    select: { cedenteId: true, program: true },
  });
  const map = new Map<string, LoyaltyProgram[]>();
  for (const row of rows) {
    if (!row.program) continue;
    const cur = map.get(row.cedenteId) ?? [];
    if (!cur.includes(row.program)) cur.push(row.program);
    map.set(row.cedenteId, cur);
  }
  return map;
}
