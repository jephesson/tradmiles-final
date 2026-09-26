import { NextRequest, NextResponse } from "next/server";
import { Prisma, type SalePaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: string) {
  return String(v || "").replace(/\D+/g, "");
}

function saleTeamScope(team: string): Prisma.SaleWhereInput {
  return {
    OR: [
      { seller: { team } },
      { cedente: { owner: { team } } },
      { cliente: { createdBy: { team } } },
    ],
  };
}

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const status = (searchParams.get("status") || "ALL").trim().toUpperCase();
  const limitRaw = Number(searchParams.get("limit") || 40);
  const limit = Math.max(1, Math.min(80, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 40));

  const where: Prisma.SaleWhereInput = {
    AND: [saleTeamScope(session.team)],
  };

  if (status === "CANCELED") where.paymentStatus = "CANCELED";
  else if (status === "ACTIVE") where.paymentStatus = { not: "CANCELED" };
  else if (status === "PENDING" || status === "PAID") {
    where.paymentStatus = status as SalePaymentStatus;
  }

  if (q.length >= 2) {
    const digits = onlyDigits(q);
    where.AND = [
      saleTeamScope(session.team),
      {
        OR: [
          { locator: { contains: q, mode: "insensitive" } },
          { numero: { contains: q, mode: "insensitive" } },
          { purchaseCode: { contains: q, mode: "insensitive" } },
          { firstPassengerLastName: { contains: q, mode: "insensitive" } },
          { smilesConfirmPassengerNames: { contains: q, mode: "insensitive" } },
          { departureAirportIata: { contains: q, mode: "insensitive" } },
          { cliente: { nome: { contains: q, mode: "insensitive" } } },
          { cliente: { identificador: { contains: q, mode: "insensitive" } } },
          ...(digits.length >= 3
            ? [{ cliente: { cpfCnpj: { contains: digits, mode: "insensitive" as const } } }]
            : []),
          { cedente: { nomeCompleto: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }

  try {
    const sales = await prisma.sale.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        numero: true,
        date: true,
        program: true,
        points: true,
        passengers: true,
        milheiroCents: true,
        embarqueFeeCents: true,
        pointsValueCents: true,
        totalCents: true,
        paymentStatus: true,
        paidAt: true,
        locator: true,
        purchaseCode: true,
        firstPassengerLastName: true,
        departureAirportIata: true,
        departureDate: true,
        returnDate: true,
        feeCardLabel: true,
        latamLocatorCheckStatus: true,
        latamLocatorCheckedAt: true,
        smilesLocatorManualStatus: true,
        smilesConfirmPassengerNames: true,
        canceledAt: true,
        cancelFineCents: true,
        cancelRefundCents: true,
        cliente: {
          select: {
            id: true,
            identificador: true,
            nome: true,
            cpfCnpj: true,
            telefone: true,
          },
        },
        cedente: {
          select: { id: true, identificador: true, nomeCompleto: true },
        },
        seller: { select: { id: true, name: true, login: true } },
        purchase: { select: { id: true, numero: true } },
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, sales, query: q });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error && e.message ? e.message : "Falha ao buscar localizadores.",
      },
      { status: 400 }
    );
  }
}
