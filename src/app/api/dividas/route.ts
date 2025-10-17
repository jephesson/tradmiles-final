// src/app/api/dividas/route.ts
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

// Opcional: pode rodar no edge
export const runtime = "edge";
// Força buscar sempre no KV (sem cache do Next)
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

// chave única do projeto (troque se quiser multi-tenant)
const KEY = "TM:DIVIDAS:BLOB:v1";

/** GET /api/dividas
 *  Retorna { ok: true, data: DividasBlob }
 */
export async function GET() {
  try {
    const data = (await kv.get<DividasBlob>(KEY)) ?? { debts: [], txns: [], savedAt: undefined };
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: "Falha ao carregar dívidas" }, { status: 500 });
  }
}

/** PATCH /api/dividas
 *  Body: { debts: Debt[], txns: DebtTxn[] }
 *  Salva e retorna { ok: true, data }
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Partial<DividasBlob> | undefined;

    // validações simples
    if (!body || !Array.isArray(body.debts) || !Array.isArray(body.txns)) {
      return NextResponse.json(
        { ok: false, error: "Payload inválido. Envie { debts: [], txns: [] }" },
        { status: 400 }
      );
    }

    // Normalização mínima (garante tipos numéricos)
    const debts: Debt[] = body.debts.map((d: any) => ({
      id: String(d.id),
      nome: String(d.nome ?? ""),
      inicial: Number(d.inicial || 0),
      nota: d.nota ? String(d.nota) : undefined,
      createdAt: d.createdAt ? String(d.createdAt) : new Date().toISOString(),
      isClosed: Boolean(d.isClosed),
    }));

    const txns: DebtTxn[] = body.txns.map((t: any) => ({
      id: String(t.id),
      debtId: String(t.debtId),
      tipo: t.tipo === "pay" ? "pay" : "add",
      valor: Number(t.valor || 0),
      obs: t.obs ? String(t.obs) : undefined,
      dataISO: t.dataISO ? String(t.dataISO) : new Date().toISOString(),
    }));

    const data: DividasBlob = { debts, txns, savedAt: new Date().toISOString() };

    await kv.set(KEY, data);

    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: "Falha ao salvar dívidas" }, { status: 500 });
  }
}
