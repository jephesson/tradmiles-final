import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
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

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
  email?: string | null;
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function isPurchaseNumero(v: string) {
  return /^ID\d{5}$/i.test(v.trim());
}

// ✅ parse local para YYYY-MM-DD (evita “voltar 1 dia”)
function parseDateISOToLocal(v?: any): Date {
  const s = String(v || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date();
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mm - 1, d);
}

// ✅ dentro do $transaction, use tx!
async function nextCounter(tx: Prisma.TransactionClient, key: string) {
  await tx.counter.upsert({
    where: { key },
    create: { key, value: 0 },
    update: {},
    select: { key: true, value: true },
  });

  const updated = await tx.counter.update({
    where: { key },
    data: { value: { increment: 1 } },
    select: { value: true },
  });

  return updated.value;
}

// ✅ resolve cedenteId por UUID ou identificador
async function resolveCedenteId(tx: Prisma.TransactionClient, cedenteKey: string) {
  const key = (cedenteKey || "").trim();
  const ced = await tx.cedente.findFirst({
    where: { OR: [{ id: key }, { identificador: key }] },
    select: { id: true },
  });
  return ced?.id ?? null;
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
  const session = await getServerSession();
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

  const cedenteKey = String(body.cedenteId || "").trim(); // pode ser UUID ou identificador
  const clienteId = String(body.clienteId || "").trim();

  const purchaseKey = String(body.purchaseNumero || body.purchaseId || "").trim(); // ID00018 ou cuid

  const feeCardLabel = body.feeCardLabel ? String(body.feeCardLabel) : null;
  const locator = body.locator ? String(body.locator) : null;

  const date = parseDateISOToLocal(body.date);

  if (!["LATAM", "SMILES", "LIVELO", "ESFERA"].includes(program)) {
    return NextResponse.json({ ok: false, error: "Programa inválido" }, { status: 400 });
  }
  if (!cedenteKey || !clienteId) {
    return NextResponse.json({ ok: false, error: "Cedente/Cliente obrigatório" }, { status: 400 });
  }
  if (!purchaseKey) {
    return NextResponse.json({ ok: false, error: "Compra (ID) obrigatória" }, { status: 400 });
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
      // ✅ resolve cedenteId real
      const cedenteId = await resolveCedenteId(tx, cedenteKey);
      if (!cedenteId) throw new Error("Cedente não encontrado.");

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

      // resolve purchase por numero (ID00018) ou id (cuid)
      const purchase =
        isPurchaseNumero(purchaseKey)
          ? await tx.purchase.findFirst({
              where: { numero: purchaseKey.toUpperCase(), cedenteId },
              select: { id: true, cedenteId: true, status: true, metaMilheiroCents: true },
            })
          : await tx.purchase.findUnique({
              where: { id: purchaseKey },
              select: { id: true, cedenteId: true, status: true, metaMilheiroCents: true },
            });

      if (!purchase) throw new Error("Compra não encontrada.");
      if (purchase.status !== "OPEN") throw new Error("Compra não está OPEN.");
      if (purchase.cedenteId !== cedenteId) throw new Error("Compra não pertence ao cedente selecionado.");

      const purchaseIdReal = purchase.id;
      const metaMilheiroCents = clampInt(purchase.metaMilheiroCents);

      const pointsValueCents = calcPointsValueCents(points, milheiroCents);
      const totalCents = pointsValueCents + embarqueFeeCents;

      const commissionCents = calcCommissionCents(pointsValueCents);
      const bonusCents = calcBonusCents(points, milheiroCents, metaMilheiroCents);

      // ✅ contador com tx
      const n = await nextCounter(tx, "SALE");
      const numero = formatSaleNumber(n);

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
          purchaseId: purchaseIdReal,
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
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao criar venda" },
      { status: 400 }
    );
  }
}
