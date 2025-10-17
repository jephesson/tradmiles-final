// src/app/api/dividas/route.ts
import { NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Prisma precisa rodar no runtime Node (não Edge).
 * O Edge não suporta o client do Prisma.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** -------- Prisma singleton (evita instâncias repetidas em dev) -------- */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
if (!globalForPrisma.prisma) globalForPrisma.prisma = prisma;

/** -------- Tipos do payload da API (match com o front) -------- */
type Debt = {
  id: string;
  nome: string;
  inicial: number;
  nota?: string;
  createdAt: string;
  isClosed?: boolean;
};
type DebtTxn = {
  id: string;
  debtId: string;
  tipo: "add" | "pay";
  valor: number;
  obs?: string;
  dataISO: string;
};
type DividasBlob = { debts: Debt[]; txns: DebtTxn[]; savedAt?: string };

/** -------- Helpers -------- */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function toNumber(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Normalizadores: blindam contra "any" vindo do front */
function normDebt(input: unknown): Debt {
  const d = (input ?? {}) as Record<string, unknown>;
  return {
    id: String(d.id ?? ""),
    nome: String(d.nome ?? ""),
    inicial: toNumber(d.inicial ?? 0),
    nota: d.nota != null && d.nota !== "" ? String(d.nota) : undefined,
    createdAt: d.createdAt ? String(d.createdAt) : new Date().toISOString(),
    isClosed: Boolean(d.isClosed),
  };
}
function normTxn(input: unknown): DebtTxn {
  const t = (input ?? {}) as Record<string, unknown>;
  const tipo = t.tipo === "pay" ? "pay" : "add";
  return {
    id: String(t.id ?? ""),
    debtId: String(t.debtId ?? ""),
    tipo,
    valor: toNumber(t.valor ?? 0),
    obs: t.obs != null && t.obs !== "" ? String(t.obs) : undefined,
    dataISO: t.dataISO ? String(t.dataISO) : new Date().toISOString(),
  };
}

/** -------- GET /api/dividas --------
 * Lê direto do Neon (tabelas: Debt, DebtTxn).
 */
export async function GET() {
  try {
    const [debtsDb, txnsDb] = await Promise.all([
      prisma.debt.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.debtTxn.findMany({ orderBy: { dataISO: "desc" } }),
    ]);

    const debts: Debt[] = debtsDb.map((d) => ({
      id: d.id,
      nome: d.nome,
      inicial: Number(d.inicial), // Decimal -> number
      nota: d.nota ?? undefined,
      createdAt: d.createdAt.toISOString(),
      isClosed: d.isClosed ?? false,
    }));

    const txns: DebtTxn[] = txnsDb.map((t) => ({
      id: t.id,
      debtId: t.debtId,
      tipo: t.tipo as "add" | "pay",
      valor: Number(t.valor),
      obs: t.obs ?? undefined,
      dataISO: t.dataISO.toISOString(),
    }));

    return NextResponse.json({ ok: true, data: { debts, txns } as DividasBlob });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Falha ao carregar dívidas (Neon)";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** -------- PATCH /api/dividas --------
 * Sobrescreve o snapshot: apaga tudo e recria (transação).
 * Payload: { debts: Debt[], txns: DebtTxn[] }
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Partial<DividasBlob> | undefined;
    if (!body || !Array.isArray(body.debts) || !Array.isArray(body.txns)) {
      return NextResponse.json(
        { ok: false, error: "Payload inválido. Envie { debts: [], txns: [] }" },
        { status: 400 }
      );
    }

    const debts = (body.debts as unknown[]).map(normDebt);
    const txns = (body.txns as unknown[]).map(normTxn);

    const savedAt = new Date().toISOString();

    await prisma.$transaction(async (tx) => {
      // zera primeiro (mantém integridade referencial)
      await tx.debtTxn.deleteMany();
      await tx.debt.deleteMany();

      // recria dívidas
      if (debts.length) {
        await tx.debt.createMany({
          data: debts.map((d) => ({
            id: d.id,
            nome: d.nome,
            inicial: new Prisma.Decimal(d.inicial),
            nota: d.nota ?? null,
            createdAt: new Date(d.createdAt),
            isClosed: d.isClosed ?? false,
          })),
        });
      }

      // recria transações
      if (txns.length) {
        await tx.debtTxn.createMany({
          data: txns.map((t) => ({
            id: t.id,
            debtId: t.debtId,
            tipo: t.tipo,
            valor: new Prisma.Decimal(t.valor),
            obs: t.obs ?? null,
            dataISO: new Date(t.dataISO),
          })),
        });
      }
    });

    return NextResponse.json({ ok: true, data: { debts, txns, savedAt } as DividasBlob });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Falha ao salvar dívidas (Neon)";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
