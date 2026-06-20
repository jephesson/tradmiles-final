import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim().toUpperCase();
    const take = clampInt(Number(url.searchParams.get("take") || 100), 1, 500);
    const skip = clampInt(Number(url.searchParams.get("skip") || 0), 0, 1_000_000);

    const where: {
      status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
      OR?: Array<{
        referrerCode?: { contains: string; mode: "insensitive" };
        referrerCedente?: {
          OR: Array<{
            identificador?: { contains: string; mode: "insensitive" };
            nomeCompleto?: { contains: string; mode: "insensitive" };
          }>;
        };
        referredCedente?: {
          OR: Array<{
            identificador?: { contains: string; mode: "insensitive" };
            nomeCompleto?: { contains: string; mode: "insensitive" };
            cpf?: { contains: string };
          }>;
        };
      }>;
    } = {};

    if (status && ["PENDING", "APPROVED", "REJECTED", "CANCELED"].includes(status)) {
      where.status = status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
    }

    if (q) {
      const digits = q.replace(/\D+/g, "");
      where.OR = [
        { referrerCode: { contains: q, mode: "insensitive" } },
        {
          referrerCedente: {
            OR: [
              { identificador: { contains: q, mode: "insensitive" } },
              { nomeCompleto: { contains: q, mode: "insensitive" } },
            ],
          },
        },
        {
          referredCedente: {
            OR: [
              { identificador: { contains: q, mode: "insensitive" } },
              { nomeCompleto: { contains: q, mode: "insensitive" } },
              ...(digits ? [{ cpf: { contains: digits } }] : []),
            ],
          },
        },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.cedenteReferral.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        include: {
          referrerCedente: {
            select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
          },
          referredCedente: {
            select: {
              id: true,
              identificador: true,
              nomeCompleto: true,
              cpf: true,
              status: true,
              owner: { select: { id: true, name: true, login: true } },
            },
          },
          commission: {
            select: { id: true, amountCents: true, status: true, generatedAt: true },
          },
        },
      }),
      prisma.cedenteReferral.count({ where }),
    ]);

    return NextResponse.json({ ok: true, data: { items, total, take, skip } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao listar histórico.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
