// src/lib/comprasRepo.ts
import fs from "node:fs";
import path from "node:path";

/** ===================== Tipos ===================== */
export type CIA = "latam" | "smiles";
export type Origem = "livelo" | "esfera";
export type StatusPontos = "aguardando" | "liberados";

/**
 * Estrutura genérica para o campo `valores` usada em itens/compat:
 * mantém os campos que você acessa no código e permite extras.
 */
export type ValoresGenericos = Record<string, unknown> & {
  ciaCompra?: CIA;
  destCia?: CIA;
  origem?: Origem;
};

export type CompraItemResumo = {
  totalPts: number;
  custoMilheiro: number;
  custoTotal: number;
  lucroTotal: number;
};

export type CompraItem = {
  idx: number;
  modo: "compra" | "transferencia";
  resumo: CompraItemResumo;
  valores: ValoresGenericos;
};

export type CompraDoc = {
  id: string;                 // "0001", "0002", ...
  dataCompra: string;         // YYYY-MM-DD
  statusPontos?: StatusPontos;
  cedenteId?: string;
  itens?: CompraItem[];
  totaisId?: {
    totalPts: number;
    custoMilheiro: number;
    custoTotal: number;
    lucroTotal: number;
  };
  // compat com modelo antigo
  modo?: "compra" | "transferencia";
  ciaCompra?: CIA;
  destCia?: CIA;
  origem?: Origem;
  valores?: ValoresGenericos;
  calculos?: CompraItemResumo;
  savedAt?: number;
};

/** ================== Acesso a arquivo ================== */
const DATA = path.join(process.cwd(), ".data/compras.json");

function readAll(): CompraDoc[] {
  try {
    const raw = fs.readFileSync(DATA, "utf8");
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CompraDoc[]) : [];
  } catch {
    return [];
  }
}
function writeAll(arr: CompraDoc[]) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(arr, null, 2), "utf8");
}

/** ================== Helpers ================== */
function totalsFromItens(itens: CompraItem[] = []) {
  const totalPts = itens.reduce((s, i) => s + (i?.resumo?.totalPts || 0), 0);
  const custoTotal = itens.reduce((s, i) => s + (i?.resumo?.custoTotal || 0), 0);

  const acc = itens.reduce(
    (a, i) => {
      const pts = i?.resumo?.totalPts || 0;
      const milheiros = pts / 1000;
      if (milheiros > 0) {
        a.peso += milheiros;
        a.acum += (i?.resumo?.custoTotal || 0) / milheiros;
      }
      return a;
    },
    { peso: 0, acum: 0 }
  );
  const custoMilheiro = acc.peso > 0 ? acc.acum / acc.peso : 0;

  const lucroTotal = itens.reduce((s, i) => s + (i?.resumo?.lucroTotal || 0), 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** ================== Repositório ================== */
// Mantém o nome antigo
export async function listCompras(): Promise<CompraDoc[]> {
  return readAll();
}
// E exporta o nome que a rota usa
export async function listComprasRaw(): Promise<CompraDoc[]> {
  return readAll();
}

export async function upsertCompra(doc: CompraDoc): Promise<CompraDoc> {
  const all = readAll();
  const idx = all.findIndex((x) => x.id === doc.id);
  const row: CompraDoc = { ...doc, savedAt: Date.now() };
  if (idx >= 0) all[idx] = row;
  else all.push(row);
  writeAll(all);
  return row;
}

export async function findCompraById(id: string): Promise<CompraDoc | null> {
  const all = readAll();
  return all.find((x) => x.id === id) || null;
}

export async function deleteCompraById(id: string): Promise<void> {
  const all = readAll();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) throw new Error("ID não encontrado");
  writeAll(next);
}

/**
 * Atualiza parcialmente um documento (merge superficial),
 * recalculando totais/compat quando `itens` for enviado no patch.
 */
export async function updateCompraById(
  id: string,
  patch: Partial<CompraDoc>
): Promise<CompraDoc | null> {
  const all = readAll();
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) return null;

  const prev = all[idx];

  // aplica patch sem permitir troca de id
  const updated: CompraDoc = { ...prev, ...patch, id: prev.id };

  // se chegou uma nova lista de itens, recalcula totais e compat
  if (Array.isArray(patch.itens)) {
    const itens = patch.itens as CompraItem[];
    const totais = totalsFromItens(itens);
    updated.itens = itens;
    updated.totaisId = totais;
    // compat para telas antigas
    const first = itens[0] || null;
    updated.modo = first?.modo ?? prev.modo;
    updated.ciaCompra =
      first?.modo === "compra" ? (first?.valores?.ciaCompra as CIA | undefined) ?? prev.ciaCompra : prev.ciaCompra;
    updated.destCia =
      first?.modo === "transferencia" ? (first?.valores?.destCia as CIA | undefined) ?? prev.destCia : prev.destCia;
    updated.origem =
      first?.modo === "transferencia" ? (first?.valores?.origem as Origem | undefined) ?? prev.origem : prev.origem;
    updated.calculos = { ...totais };
  }

  // se chegaram totais prontos no patch, mantém compat também
  if (patch.totaisId) {
    updated.totaisId = { ...patch.totaisId };
    updated.calculos = { ...patch.totaisId };
  }

  updated.savedAt = Date.now();
  all[idx] = updated;
  writeAll(all);
  return updated;
}

/**
 * Próximo ID curto sequencial com 4 dígitos (string).
 * Ex.: "0001", "0002", ...
 */
export async function nextShortId(): Promise<string> {
  const all = readAll();
  const nums = all
    .map((r) => String(r.id))
    .map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : NaN))
    .filter((n) => Number.isFinite(n)) as number[];
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1).padStart(4, "0");
}
