import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseDateOnly(s: string) {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida.");
  return d;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  try {
    const session = await getSessionServer();
    const team = String(session?.team || "");
    if (!team) return badRequest("Sessão inválida: faça login novamente.");

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") || "").toUpperCase();
    const affiliateId = url.searchParams.get("affiliateId") || "";
    const purchaseId = url.searchParams.get("purchaseId") || "";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const take = clampInt(url.searchParams.get("take"), 1, 200);
    const skip = clampInt(url.searchParams.get("skip"), 0, 1_000_000);
    const topWindowDays = clampInt(url.searchParams.get("topWindowDays"), 30, 365);

    const where: Record<string, unknown> = {
      affiliate: { team },
    };

    if (status) {
      if (!["PENDING", "PAID", "CANCELED"].includes(status)) {
        return badRequest("status inválido. Use PENDING, PAID ou CANCELED.");
      }
      where.status = status;
    }

    if (affiliateId) where.affiliateId = affiliateId;
    if (purchaseId) where.purchaseId = purchaseId;

    if (from || to) {
      const generatedAt: Record<string, Date> = {};
      if (from) generatedAt.gte = parseDateOnly(from);
      if (to) generatedAt.lte = endOfDay(parseDateOnly(to));
      where.generatedAt = generatedAt;
    }

    const topPaidFrom = daysAgo(topWindowDays);

    const [items, total, topRecebedores] = await prisma.$transaction([
      prisma.affiliateCommission.findMany({
        where,
        orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
        take,
        skip,
        include: {
          affiliate: {
            select: {
              id: true,
              name: true,
              document: true,
              login: true,
              pixKey: true,
              commissionBps: true,
            },
          },
          cliente: {
            select: {
              id: true,
              identificador: true,
              nome: true,
              telefone: true,
            },
          },
          sale: {
            select: {
              id: true,
              numero: true,
              date: true,
              program: true,
              totalCents: true,
              points: true,
              locator: true,
              paymentStatus: true,
            },
          },
          purchase: {
            select: {
              id: true,
              numero: true,
              status: true,
              totalCents: true,
            },
          },
          generatedBy: { select: { id: true, name: true, login: true } },
          paidBy: { select: { id: true, name: true, login: true } },
        },
      }),
      prisma.affiliateCommission.count({ where }),
      prisma.affiliateCommission.groupBy({
        by: ["affiliateId"],
        where: {
          affiliate: { team },
          status: "PAID",
          paidAt: { gte: topPaidFrom },
        },
        _sum: { amountCents: true },
        _count: { _all: true },
        orderBy: { _sum: { amountCents: "desc" } },
        take: 50,
      }),
    ]);

    const affiliateIds = topRecebedores
      .map((row) => row.affiliateId)
      .filter((id): id is string => Boolean(id));

    const affiliates = affiliateIds.length
      ? await prisma.affiliate.findMany({
          where: { id: { in: affiliateIds } },
          select: {
            id: true,
            name: true,
            document: true,
            login: true,
            pixKey: true,
            commissionBps: true,
          },
        })
      : [];

    const affiliateMap = new Map(affiliates.map((row) => [row.id, row]));

    return ok({
      total,
      take,
      skip,
      items,
      topWindowDays,
      topRecebedores: topRecebedores.map((row) => ({
        affiliateId: row.affiliateId,
        totalCents: row._sum?.amountCents || 0,
        count:
          typeof row._count === "object" && row._count && "_all" in row._count
            ? row._count._all || 0
            : 0,
        affiliate: row.affiliateId ? affiliateMap.get(row.affiliateId) || null : null,
      })),
    });
  } catch (error: unknown) {
    return serverError("Falha ao listar comissões de afiliados.", {
      detail: error instanceof Error ? error.message : String(error || ""),
    });
  }
}
