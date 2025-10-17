import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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

type DividasBlob = {
  debts: Debt[];
  txns: DebtTxn[];
  savedAt?: string;
};

const KEY = "TM:DIVIDAS:BLOB:v1";

/* ------------ normalizadores (acabam com o any) ------------ */
function normalizeDebt(input: unknown): Debt {
  const d = (input ?? {}) as Record<string, unknown>;
  return {
    id: String(d.id ?? ""),
    nome: String(d.nome ?? ""),
    inicial: Number(d.inicial ?? 0),
    nota: d.nota != null && d.nota !== "" ? String(d.nota) : undefined,
    createdAt: d.createdAt ? String(d.createdAt) : new Date().toISOString(),
    isClosed: Boolean(d.isClosed),
  };
}
function normalizeTxn(input: unknown): DebtTxn {
  const t = (input ?? {}) as Record<string, unknown>;
  const tipo = t.tipo === "pay" ? "pay" : "add";
  return {
    id: String(t.id ?? ""),
    debtId: String(t.debtId ?? ""),
    tipo,
    valor: Number(t.valor ?? 0),
    obs: t.obs != null && t.obs !== "" ? String(t.obs) : undefined,
    dataISO: t.dataISO ? String(t.dataISO) : new Date().toISOString(),
  };
}

/** GET /api/dividas -> { ok: true, data } */
export async function GET() {
  try {
    const data = (await kv.get<DividasBlob>(KEY)) ?? { debts: [], txns: [], savedAt: undefined };
    return NextResponse.json({ ok: true, data });
  } catch (_e: unknown) {
    return NextResponse.json({ ok: false, error: "Falha ao carregar dívidas" }, { status: 500 });
  }
}

/** PATCH /api/dividas
 * Body: { debts: Debt[], txns: DebtTxn[] }
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

    const debts: Debt[] = (body.debts as unknown[]).map(normalizeDebt);
    const txns: DebtTxn[] = (body.txns as unknown[]).map(normalizeTxn);

    const data: DividasBlob = { debts, txns, savedAt: new Date().toISOString() };
    await kv.set(KEY, data);

    return NextResponse.json({ ok: true, data });
  } catch (_e: unknown) {
    return NextResponse.json({ ok: false, error: "Falha ao salvar dívidas" }, { status: 500 });
  }
}
