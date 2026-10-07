import { prisma } from "@/lib/prisma";
import { interConfigured } from "@/lib/inter/config";
import { fetchInterSaldo } from "@/lib/inter/saldo";

export const INTER_CAIXA_LABEL = "Inter";

export function isInterCaixaDescription(desc: string) {
  const d = String(desc || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!d) return false;
  if (d === "inter" || d === "banco inter") return true;
  if (/^banco\s+inter\b/.test(d)) return true;
  if (/^inter\b/.test(d) && !/recarga/.test(d)) return true;
  return false;
}

export async function syncInterCaixaBalance(team: string): Promise<{
  configured: boolean;
  synced: boolean;
  availableCents: number | null;
  error: string | null;
}> {
  if (!interConfigured()) {
    return { configured: false, synced: false, availableCents: null, error: null };
  }

  try {
    const saldo = await fetchInterSaldo();
    const rows = await prisma.creditCardBalance.findMany({
      where: { team },
      select: { id: true, description: true },
      orderBy: { createdAt: "asc" },
    });
    const interRows = rows.filter((r) => isInterCaixaDescription(r.description));
    const keep = interRows[0];
    const extraIds = interRows.slice(1).map((r) => r.id);
    if (extraIds.length) {
      await prisma.creditCardBalance.deleteMany({ where: { id: { in: extraIds } } });
    }
    if (keep) {
      await prisma.creditCardBalance.update({
        where: { id: keep.id },
        data: {
          amountCents: saldo.availableCents,
          description: INTER_CAIXA_LABEL,
        },
      });
    } else {
      await prisma.creditCardBalance.create({
        data: {
          team,
          description: INTER_CAIXA_LABEL,
          amountCents: saldo.availableCents,
        },
      });
    }
    return {
      configured: true,
      synced: true,
      availableCents: saldo.availableCents,
      error: null,
    };
  } catch (e) {
    return {
      configured: true,
      synced: false,
      availableCents: null,
      error: e instanceof Error ? e.message : "Não foi possível consultar o Inter.",
    };
  }
}
