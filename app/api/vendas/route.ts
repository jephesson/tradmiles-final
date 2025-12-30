import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  calcBonusCents,
  calcCommissionCents,
  calcPointsValueCents,
  clampInt,
  formatSaleNumber,
  passengerLimit,
  pointsField,
  startOfYear,
  endOfYearExclusive,
} from "../_helpers/sales";
import { getSession } from "@/lib/auth";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

async function nextCounter(key: string) {
  // padrão com tabela Counter
  const c = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 0 },
    update: {},
    select: { key: true, value: true },
  });

  const updated = await prisma.counter.update({
    where: { key },
    data: { value: { increment: 1 } },
    select: { value: true },
  });

  return updated.value;
}

export async function GET() {
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: "desc" },
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
      locator: true,
      feeCardLabel: true,
      commissionCents: true,
      bonusCents: true,
      metaMilheiroCents: true,
      cliente: { select: { id: true, identificador: true, nome: true } },
      cedente: { select: { id: true, identificador: true, nomeCompleto: true } },
      purchase: { select: { id: true, numero: true } },
      seller: { select: { id: true, name: true, login: true } },
      createdAt: true,
    },
    take: 200,
  });

  return NextResponse.json({ ok: true, sales });
}

export async function POST(req: Request) {
  const session = getSession();

  // ✅ FIX: Session não tem "user" no teu tipo, então pega direto o id
  const userId = session?.id ?? null;

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const program = body.program as Program;
  const points = clampInt(body.points);
  const passengers = clampInt(body.passengers);
  const milheiroCents = clampInt(body.milheiroCents);
  const embarqueFeeCents = clampInt(body.embarqueFeeCents);

  const cedenteId = String(body.cedenteId || "");
  const clienteId = String(body.clienteId || "");
  const purchaseId = body.purchaseId ? String(body.purchaseId) : null;

  const feeCardLabel = body.feeCardLabel ? String(body.feeCardLabel) : null;
  const locator = body.locator ? String(body.locator) : null;

  const date = body.date ? new Date(body.date) : new Date();

  if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program)) {
    return NextResponse.json({ ok: false, error: "Programa inválido" }, { status: 400 });
  }
  if (!cedenteId || !clienteId) {
    return NextResponse.json({ ok: false, error: "Cedente/Cliente obrigatório" }, { status: 400 });
  }
  if (points <= 0 || passengers <= 0) {
    return NextResponse.json({ ok: false, error: "Pontos/Passageiros inválidos" }, { status: 400 });
  }
  if (milheiroCents <= 0) {
    return NextResponse.json({ ok: false, error: "Milheiro inválido" }, { status: 400 });
  }

  const yearStart = startOfYear();
  const yearEnd = endOfYearExclusive();
  const paxLimit = passengerLimit(program);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // bloqueio?
      const hasBlock = await tx.blockedAccount.findFirst({
        where: { cedenteId, program, status: "OPEN" },
        select: { id: true },
      });
      if (hasBlock) throw new Error("Conta bloqueada para este programa.");

      // cedente
      const ced = await tx.cedente.findUnique({
        where: { id: cedenteId },
        select: {
          id: true,
          status: true,
          pontosLatam: true,
          pontosSmiles: true,
          pontosLivelo: true,
          pontosEsfera: true,
        },
      });
      if (!ced) throw new Error("Cedente não encontrado.");
      if (ced.status !== "APPROVED") throw new Error("Cedente não aprovado.");

      // passageiros usados no ano
      const usedAgg = await tx.emissionEvent.aggregate({
        where: { cedenteId, program, issuedAt: { gte: yearStart, lt: yearEnd } },
        _sum: { passengersCount: true },
      });
      const used = clampInt(usedAgg._sum.passengersCount);
      const availablePax = Math.max(0, paxLimit - used);
      if (availablePax < passengers) throw new Error("Passageiros insuficientes no ano.");

      // pontos disponíveis
      const field = pointsField(program) as keyof typeof ced;
      const availablePts = clampInt((ced as any)[field]);
      if (availablePts < points) throw new Error("Pontos insuficientes.");

      // compra OPEN (meta)
      let metaMilheiroCents = 0;
      if (purchaseId) {
        const p = await tx.purchase.findUnique({
          where: { id: purchaseId },
          select: { id: true, cedenteId: true, status: true, metaMilheiroCents: true },
        });
        if (!p) throw new Error("Compra não encontrada.");
        if (p.status !== "OPEN") throw new Error("Compra não está OPEN.");
        if (p.cedenteId !== cedenteId) throw new Error("Compra não pertence ao cedente selecionado.");
        metaMilheiroCents = clampInt(p.metaMilheiroCents);
      }

      const pointsValueCents = calcPointsValueCents(points, milheiroCents);
      const totalCents = pointsValueCents + embarqueFeeCents;

      const commissionCents = calcCommissionCents(pointsValueCents);
      const bonusCents = calcBonusCents(points, milheiroCents, metaMilheiroCents);

      // número sequencial
      const n = await nextCounter("SALE");
      const numero = formatSaleNumber(n);

      // receivable
      const cliente = await tx.cliente.findUnique({
        where: { id: clienteId },
        select: { nome: true },
      });
      if (!cliente) throw new Error("Cliente não encontrado.");

      const receivable = await tx.receivable.create({
        data: {
          title: `Venda ${numero} • ${cliente.nome}`,
          description: `Programa ${program} • ${points} pts • ${passengers} pax`,
          totalCents,
          receivedCents: 0,
          balanceCents: totalCents,
          status: "OPEN",
        },
      });

      // cria sale
      const sale = await tx.sale.create({
        data: {
          numero,
          date,
          program,
          points,
          passengers,
          milheiroCents,
          embarqueFeeCents,
          pointsValueCents,
          totalCents,
          commissionCents,
          bonusCents,
          metaMilheiroCents,
          feeCardLabel,
          locator,
          paymentStatus: "PENDING",
          cedenteId,
          clienteId,
          purchaseId,
          sellerId: userId,
          receivableId: receivable.id,
        },
        select: { id: true, numero: true },
      });

      // debita pontos do cedente
      const decData: any = {};
      decData[field] = { decrement: points };

      await tx.cedente.update({
        where: { id: cedenteId },
        data: decData,
      });

      // registra emissão (contagem anual)
      await tx.emissionEvent.create({
        data: {
          cedenteId,
          program,
          passengersCount: passengers,
          issuedAt: date,
          source: "SALE",
          note: `Venda ${sale.numero}${locator ? ` • Locator ${locator}` : ""}`,
        },
      });

      return sale;
    });

    return NextResponse.json({ ok: true, sale: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao criar venda" }, { status: 400 });
  }
}
