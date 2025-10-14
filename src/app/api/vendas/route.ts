// app/api/vendas/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ================== Tipos ================== */
type PaymentStatus = "pago" | "pendente";
type CIA = "latam" | "smiles";

type CancelInfo = {
  at: string;
  taxaCia: number;
  taxaEmpresa: number;
  refund: number;
  recreditPoints?: boolean;
  note?: string | null;
};

type ContaEscolhida = {
  id: string;
  nome: string;
  usar: number;
  disponivel: number;
  leftover: number;
  compraId: string | null;
  regra?: string;
};

type SugestaoParte = { id: string; nome: string; usar: number; disp: number };

type VendaRecord = {
  id: string;
  createdAt: string;

  data: string;
  pontos: number;
  cia: CIA;
  qtdPassageiros: number;

  funcionarioId: string | null;
  funcionarioNome: string | null;
  userName: string | null;
  userEmail: string | null;

  clienteId: string | null;
  clienteNome: string | null;
  clienteOrigem: string | null;

  contaEscolhida?: ContaEscolhida | null;
  sugestaoCombinacao?: SugestaoParte[];

  milheiros: number;
  valorMilheiro: number;
  valorPontos: number;
  taxaEmbarque: number;
  totalCobrar: number;

  metaMilheiro: number | null;
  comissaoBase: number;
  comissaoBonusMeta: number;
  comissaoTotal: number;

  cartaoFuncionarioId: string | null;
  cartaoFuncionarioNome: string | null;

  pagamentoStatus: PaymentStatus;

  localizador: string | null;
  origemIATA: string | null;
  sobrenome: string | null;

  cancelInfo?: CancelInfo | null;
};

type CedenteRec = {
  identificador: string;
  nome: string | null;
  nome_completo: string | null;
  latam: number;
  smiles: number;
  livelo: number;
  esfera: number;
};

/* ================== Utils ================== */
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}
function up(s: unknown): string {
  return String(s ?? "").toUpperCase();
}
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/* ================== Persistência ================== */
// Em produção (Vercel) só /tmp é gravável; local: ./data
const ROOT_DIR = process.env.VERCEL ? "/tmp" : process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const VENDAS_FILE = path.join(DATA_DIR, "vendas.json");
const CEDENTES_FILE = path.join(DATA_DIR, "cedentes.json");

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    /* noop */
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    // ENOENT ou JSON inválido => retorna fallback
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T): Promise<void> {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

function pickCedenteFields(c: unknown): CedenteRec {
  const r = isRecord(c) ? c : {};
  return {
    identificador: String(r["identificador"] ?? ""),
    nome:
      (typeof r["nome"] === "string" ? r["nome"] : null) ??
      (typeof r["nome_completo"] === "string" ? r["nome_completo"] : null),
    nome_completo:
      (typeof r["nome_completo"] === "string" ? r["nome_completo"] : null) ??
      (typeof r["nome"] === "string" ? r["nome"] : null),
    latam: toNum(r["latam"]),
    smiles: toNum(r["smiles"]),
    livelo: toNum(r["livelo"]),
    esfera: toNum(r["esfera"]),
  };
}

/** Lê o arquivo de cedentes aceitando vários formatos e devolve um writer que preserva o formato */
async function loadCedentesFile(): Promise<{
  list: CedenteRec[];
  write: (arr: CedenteRec[]) => Promise<void>;
}> {
  const parsed = await readJson<unknown>(CEDENTES_FILE, null as unknown as Record<string, unknown>);

  let list: CedenteRec[] = [];
  if (Array.isArray(parsed)) {
    list = parsed.map(pickCedenteFields);
  } else if (isRecord(parsed) && Array.isArray(parsed["listaCedentes"])) {
    list = (parsed["listaCedentes"] as unknown[]).map(pickCedenteFields);
  } else if (isRecord(parsed) && isRecord(parsed["data"]) && Array.isArray((parsed["data"] as any)["listaCedentes"])) {
    list = ((parsed["data"] as any)["listaCedentes"] as unknown[]).map(pickCedenteFields);
  }

  const write = async (arr: CedenteRec[]) => {
    if (Array.isArray(parsed)) {
      await writeJson<CedenteRec[]>(CEDENTES_FILE, arr);
      return;
    }
    if (isRecord(parsed) && Array.isArray(parsed["listaCedentes"])) {
      const next = { ...parsed, listaCedentes: arr };
      await writeJson(CEDENTES_FILE, next as any);
      return;
    }
    if (isRecord(parsed) && isRecord(parsed["data"]) && Array.isArray((parsed["data"] as any)["listaCedentes"])) {
      const next = { ...parsed, data: { ...(parsed["data"] as object), listaCedentes: arr } };
      await writeJson(CEDENTES_FILE, next as any);
      return;
    }
    await writeJson<CedenteRec[]>(CEDENTES_FILE, arr);
  };

  return { list, write };
}

/* ================== Handlers ================== */
export async function GET(): Promise<NextResponse> {
  const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);
  return NextResponse.json({ ok: true, lista: vendas }, { headers: noCache() });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body?.["cia"] || !body?.["pontos"]) {
      return NextResponse.json(
        { ok: false, error: "Campos obrigatórios ausentes (cia, pontos)." },
        { status: 400, headers: noCache() }
      );
    }

    const { list: cedentesFromDisk, write: writeCedentesPreservingShape } = await loadCedentesFile();

    const seedArr = Array.isArray(body["cedentes"])
      ? (body["cedentes"] as unknown[])
      : Array.isArray(body["cedentesSnapshot"])
      ? (body["cedentesSnapshot"] as unknown[])
      : [];

    const cedentes: CedenteRec[] =
      Array.isArray(cedentesFromDisk) && cedentesFromDisk.length
        ? [...cedentesFromDisk]
        : seedArr.length
        ? seedArr.map(pickCedenteFields)
        : [];

    // Se não existe arquivo e veio um snapshot no POST, inicializa o arquivo
    if (cedentesFromDisk.length === 0 && seedArr.length) {
      await writeJson<CedenteRec[]>(CEDENTES_FILE, cedentes);
    }

    const id = "V" + Date.now();
    const record: VendaRecord = {
      id,
      createdAt: new Date().toISOString(),

      data: String(body["data"] ?? ""),
      pontos: toNum(body["pontos"]),
      cia: body["cia"] === "latam" ? "latam" : "smiles",
      qtdPassageiros: toNum(body["qtdPassageiros"]),

      funcionarioId: (body["funcionarioId"] as string | null | undefined) ?? null,
      funcionarioNome: (body["funcionarioNome"] as string | null | undefined) ?? null,
      userName: (body["userName"] as string | null | undefined) ?? null,
      userEmail: (body["userEmail"] as string | null | undefined) ?? null,

      clienteId: (body["clienteId"] as string | null | undefined) ?? null,
      clienteNome: (body["clienteNome"] as string | null | undefined) ?? null,
      clienteOrigem: (body["clienteOrigem"] as string | null | undefined) ?? null,

      contaEscolhida: (body["contaEscolhida"] as ContaEscolhida | null | undefined) ?? null,
      sugestaoCombinacao: Array.isArray(body["sugestaoCombinacao"])
        ? (body["sugestaoCombinacao"] as SugestaoParte[])
        : [],

      milheiros: toNum(body["milheiros"]),
      valorMilheiro: toNum(body["valorMilheiro"]),
      valorPontos: toNum(body["valorPontos"]),
      taxaEmbarque: toNum(body["taxaEmbarque"]),
      totalCobrar: toNum(body["totalCobrar"]),

      metaMilheiro: typeof body["metaMilheiro"] === "number" ? (body["metaMilheiro"] as number) : null,
      comissaoBase: toNum(body["comissaoBase"]),
      comissaoBonusMeta: toNum(body["comissaoBonusMeta"]),
      comissaoTotal: toNum(body["comissaoTotal"]),

      cartaoFuncionarioId: (body["cartaoFuncionarioId"] as string | null | undefined) ?? null,
      cartaoFuncionarioNome: (body["cartaoFuncionarioNome"] as string | null | undefined) ?? null,

      pagamentoStatus: (body["pagamentoStatus"] as PaymentStatus) || "pendente",

      localizador: (body["localizador"] as string | null | undefined) ?? null,
      origemIATA: (body["origemIATA"] as string | null | undefined) ?? null,
      sobrenome: (body["sobrenome"] as string | null | undefined) ?? null,

      cancelInfo: null,
    };

    const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);
    vendas.unshift(record);
    await writeJson(VENDAS_FILE, vendas);

    // desconta pontos
    const saldoField: keyof CedenteRec = record.cia === "latam" ? "latam" : "smiles";
    const descontar = (cedenteId: string, qtd: number) => {
      const idx = cedentes.findIndex((c) => up(c.identificador) === up(cedenteId));
      if (idx < 0) return;
      const antes = cedentes[idx][saldoField];
      cedentes[idx][saldoField] = Math.max(0, antes - toNum(qtd));
    };

    if (record.contaEscolhida?.id) {
      descontar(record.contaEscolhida.id, record.pontos);
    } else if (Array.isArray(record.sugestaoCombinacao) && record.sugestaoCombinacao.length) {
      for (const parte of record.sugestaoCombinacao) {
        descontar(parte.id, toNum(parte.usar));
      }
    }

    await writeCedentesPreservingShape(cedentes);

    return NextResponse.json({ ok: true, id, nextCedentes: cedentes }, { headers: noCache() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);

    const id = String(body["id"] ?? "");
    const idx = vendas.findIndex((v) => v.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: "Venda não encontrada." },
        { status: 404, headers: noCache() }
      );
    }
    const cur = vendas[idx];

    // 1) Atualização simples do pagamentoStatus
    if (body["pagamentoStatus"] && (body["pagamentoStatus"] === "pago" || body["pagamentoStatus"] === "pendente")) {
      vendas[idx] = { ...cur, pagamentoStatus: body["pagamentoStatus"] as PaymentStatus };
      await writeJson(VENDAS_FILE, vendas);
      return NextResponse.json({ ok: true, record: vendas[idx] }, { headers: noCache() });
    }

    // 2) Cancelamento (com taxas/estorno e possível devolução de pontos)
    if (isRecord(body["cancel"])) {
      const cancel = body["cancel"] as Record<string, unknown>;
      const taxaCia = toNum(cancel["taxaCia"]);
      const taxaEmpresa = toNum(cancel["taxaEmpresa"]);
      const recredit = Boolean(cancel["recreditPoints"]);
      const note = typeof cancel["note"] === "string" ? (cancel["note"] as string) : null;

      const refund = Math.max(0, toNum(cur.totalCobrar) - (taxaCia + taxaEmpresa));

      const updated: VendaRecord = {
        ...cur,
        cancelInfo: {
          at: new Date().toISOString(),
          taxaCia,
          taxaEmpresa,
          refund,
          recreditPoints: recredit,
          note,
        },
      };

      // devolve pontos (opcional)
      if (recredit) {
        const { list: cedentes, write } = await loadCedentesFile();
        const saldoField: keyof CedenteRec = cur.cia === "latam" ? "latam" : "smiles";
        const creditar = (cedenteId: string, qtd: number) => {
          const i = cedentes.findIndex((c) => up(c.identificador) === up(cedenteId));
          if (i < 0) return;
          const antes = cedentes[i][saldoField];
          cedentes[i][saldoField] = Math.max(0, antes + toNum(qtd));
        };

        if (cur.contaEscolhida?.id) {
          creditar(cur.contaEscolhida.id, cur.pontos);
        } else if (Array.isArray(cur.sugestaoCombinacao) && cur.sugestaoCombinacao.length) {
          for (const parte of cur.sugestaoCombinacao) {
            creditar(parte.id, toNum(parte.usar));
          }
        }
        await write(cedentes);
      }

      vendas[idx] = updated;
      await writeJson(VENDAS_FILE, vendas);
      return NextResponse.json({ ok: true, record: updated }, { headers: noCache() });
    }

    return NextResponse.json(
      { ok: false, error: "Nada para atualizar (use pagamentoStatus ou cancel)." },
      { status: 400, headers: noCache() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");
    let restorePoints = true;

    // também aceita body
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (body?.["id"]) id = String(body["id"]);
      if (typeof body?.["restorePoints"] === "boolean") restorePoints = Boolean(body["restorePoints"]);
    } catch {
      /* body vazio */
    }

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID é obrigatório." },
        { status: 400, headers: noCache() }
      );
    }

    const vendas = await readJson<VendaRecord[]>(VENDAS_FILE, []);
    const idx = vendas.findIndex((v) => v.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { ok: false, error: "Venda não encontrada." },
        { status: 404, headers: noCache() }
      );
    }

    const removed = vendas[idx];

    // devolve pontos ao apagar (por erro) — padrão: sim
    if (restorePoints) {
      const { list: cedentes, write } = await loadCedentesFile();
      const saldoField: keyof CedenteRec = removed.cia === "latam" ? "latam" : "smiles";

      const creditar = (cedenteId: string, qtd: number) => {
        const i = cedentes.findIndex((c) => up(c.identificador) === up(cedenteId));
        if (i < 0) return;
        const antes = cedentes[i][saldoField];
        cedentes[i][saldoField] = Math.max(0, antes + toNum(qtd));
      };

      if (removed.contaEscolhida?.id) {
        creditar(removed.contaEscolhida.id, removed.pontos);
      } else if (Array.isArray(removed.sugestaoCombinacao) && removed.sugestaoCombinacao.length) {
        for (const parte of removed.sugestaoCombinacao) {
          creditar(parte.id, toNum(parte.usar));
        }
      }
      await write(cedentes);
    }

    vendas.splice(idx, 1);
    await writeJson(VENDAS_FILE, vendas);
    return NextResponse.json({ ok: true, removedId: id }, { headers: noCache() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}
