// src/app/api/compras/route.ts
import { NextResponse } from "next/server";
import {
  listComprasRaw,
  findCompraById,
  upsertCompra,
  updateCompraById,
  deleteCompraById,
} from "@/lib/comprasRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------------- Helpers de tipos/guards ---------------- */
type CIA = "latam" | "smiles";
type Origem = "livelo" | "esfera";
type Status = "aguardando" | "liberados";

type AnyObj = Record<string, unknown>;

function isRecord(v: unknown): v is AnyObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function noCache(): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

/* ---------------- Helpers numéricos ---------------- */
function toMoney(v: unknown): number {
  return num(v);
}

/* ---------------- Totais (compat) ---------------- */
type TotaisCompat = {
  totalPts: number;
  custoTotal: number;
  custoMilheiro: number;
  lucroTotal: number;
};

/** Lê tanto totalCIA quanto pontosCIA (nome usado na tela nova) */
function totalsCompatFromTotais(totais: unknown): TotaisCompat {
  const t = isRecord(totais) ? totais : {};
  const totalPtsRaw = num((t as AnyObj).totalCIA ?? (t as AnyObj).pontosCIA);
  const totalPts = Math.round(totalPtsRaw);
  const custoTotal = toMoney((t as AnyObj).custoTotal ?? 0);
  const custoMilheiro =
    num((t as AnyObj).custoMilheiroTotal) > 0
      ? num((t as AnyObj).custoMilheiroTotal)
      : totalPts > 0
      ? custoTotal / (totalPts / 1000)
      : 0;
  const lucroTotal = toMoney((t as AnyObj).lucroTotal ?? 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** quando vier no formato antigo (com resumo dentro de itens) */
function totalsFromItemsResumo(itens: unknown[]): TotaisCompat {
  type MediaState = { peso: number; acum: number };

  const safe: AnyObj[] = Array.isArray(itens) ? (itens as AnyObj[]) : [];
  const totalPts = safe.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.totalPts), 0);
  const custoTotal = safe.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.custoTotal), 0);

  const pesoAcum = safe.reduce<MediaState>(
    (acc, i) => {
      const milheiros = num((i.resumo as AnyObj | undefined)?.totalPts) / 1000;
      if (milheiros > 0) {
        acc.peso += milheiros;
        acc.acum += num((i.resumo as AnyObj | undefined)?.custoTotal) / milheiros;
      }
      return acc;
    },
    { peso: 0, acum: 0 }
  );

  const custoMilheiro = pesoAcum.peso > 0 ? pesoAcum.acum / pesoAcum.peso : 0;
  const lucroTotal = safe.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.lucroTotal), 0);
  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** novo formato: soma por kind aplicando bônus e custos corretos */
function totalsFromItemsData(itens: unknown[]): TotaisCompat {
  const arr = Array.isArray(itens) ? (itens as AnyObj[]) : [];
  let totalPts = 0;
  let custoTotal = 0;

  for (const it of arr) {
    const kind = str((it as AnyObj).kind ?? (it as AnyObj).modo);
    const d = isRecord((it as AnyObj).data) ? ((it as AnyObj).data as AnyObj) : {};

    if (kind === "transferencia") {
      const modo = str(d.modo);
      const base = modo === "pontos+dinheiro" ? num(d.pontosTotais) : num(d.pontosUsados);
      const bonus = num(d.bonusPct);
      const chegam = Math.round(base * (1 + bonus / 100));
      totalPts += Math.max(0, chegam);
      custoTotal += toMoney(d.valorPago);
      continue;
    }

    if (kind === "compra") {
      const programa = str(d.programa);
      const ptsBase = num(d.pontos);
      const bonus = num(d.bonusPct);
      if (programa === "latam" || programa === "smiles") {
        totalPts += Math.round(ptsBase * (1 + bonus / 100));
      }
      custoTotal += toMoney(d.valor);
      continue;
    }

    if (kind === "clube") {
      const programa = str(d.programa);
      const pts = num(d.pontos);
      if (programa === "latam" || programa === "smiles") {
        totalPts += Math.max(0, pts);
      }
      custoTotal += toMoney(d.valor);
      continue;
    }

    // Fallbacks genéricos
    const ptsCandidates = [
      d.chegam,
      d.chegamPts,
      d.totalCIA,
      d.pontosCIA,
      d.total_destino,
      d.total,
      d.quantidade,
      d.pontosTotais,
      d.pontosUsados,
      d.pontos,
    ];
    const custoCandidates = [d.custoTotal, d.valor, d.valorPago, d.precoTotal, d.preco, d.custo];

    const pts = num(ptsCandidates.find((v) => num(v) > 0));
    const custo = toMoney(custoCandidates.find((v) => num(v) > 0));

    const totais = isRecord((it as AnyObj).totais) ? ((it as AnyObj).totais as AnyObj) : undefined;
    const ptsAlt = num(totais?.totalCIA ?? totais?.pontosCIA ?? (totais as AnyObj | undefined)?.cia);
    const custoAlt = toMoney(totais?.custoTotal);

    totalPts += pts > 0 ? pts : ptsAlt;
    custoTotal += custo > 0 ? custo : custoAlt;

    if (!(pts > 0 || ptsAlt > 0) && isRecord((it as AnyObj).resumo)) {
      totalPts += num(((it as AnyObj).resumo as AnyObj).totalPts);
    }
    if (!(custo > 0 || custoAlt > 0) && isRecord((it as AnyObj).resumo)) {
      custoTotal += num(((it as AnyObj).resumo as AnyObj).custoTotal);
    }
  }

  const custoMilheiro = totalPts > 0 ? custoTotal / (totalPts / 1000) : 0;
  const lucroTotal = arr.reduce((s, i) => s + num((i.resumo as AnyObj | undefined)?.lucroTotal), 0);

  return { totalPts, custoTotal, custoMilheiro, lucroTotal };
}

/** escolhe automaticamente o melhor jeito de consolidar totais */
function smartTotals(itens: unknown[], totais?: unknown): TotaisCompat {
  if (
    totais &&
    (isRecord(totais) &&
      ("totalCIA" in totais ||
        "pontosCIA" in totais ||
        "custoTotal" in totais ||
        "custoMilheiroTotal" in totais))
  ) {
    return totalsCompatFromTotais(totais);
  }
  const hasResumo =
    Array.isArray(itens) &&
    (itens as AnyObj[]).some((i) => isRecord(i.resumo));
  if (hasResumo) return totalsFromItemsResumo(itens as AnyObj[]);
  return totalsFromItemsData(itens);
}

/** -------- Normalizações (compat) -------- */
function normalizeFromOldShape(body: AnyObj) {
  const modo: "compra" | "transferencia" =
    (str(body.modo) as "compra" | "transferencia") ||
    (body.origem ? "transferencia" : "compra");

  const resumo = {
    totalPts: num((body.calculos as AnyObj | undefined)?.totalPts),
    custoMilheiro: num((body.calculos as AnyObj | undefined)?.custoMilheiro),
    custoTotal: num((body.calculos as AnyObj | undefined)?.custoTotal),
    lucroTotal: num((body.calculos as AnyObj | undefined)?.lucroTotal),
  };

  const valores =
    (isRecord(body.valores) ? (body.valores as AnyObj) : undefined) ?? {
      ciaCompra: body.ciaCompra,
      destCia: body.destCia,
      origem: body.origem,
    };

  const itens = [{ idx: 1, modo, resumo, valores }];
  const totaisId = { ...resumo };

  const compat = {
    modo,
    ciaCompra: modo === "compra" ? (valores?.ciaCompra as CIA | null) ?? null : null,
    destCia: modo === "transferencia" ? (valores?.destCia as CIA | null) ?? null : null,
    origem: modo === "transferencia" ? (valores?.origem as Origem | null) ?? null : null,
  };

  const totais = {
    totalCIA: resumo.totalPts,
    custoTotal: resumo.custoTotal,
    custoMilheiroTotal: resumo.custoMilheiro,
    lucroTotal: resumo.lucroTotal,
  };

  return { itens, totaisId, totais, compat };
}

function normalizeFromNewShape(body: AnyObj) {
  const itens: unknown[] = Array.isArray(body.itens) ? (body.itens as unknown[]) : [];
  const totals = smartTotals(itens, body.totais);

  // compat para listagem/filtros antigos
  let modo: "compra" | "transferencia" | null = null;
  const kinds = new Set(
    (itens || []).map((it) => {
      const o = it as AnyObj;
      return (o.modo as string | undefined) ?? (o.kind as string | undefined);
    })
  );
  if (kinds.size === 1) {
    const k = [...kinds][0];
    if (k === "compra" || k === "transferencia") modo = k;
  }

  let ciaCompra: CIA | null = null;
  let destCia: CIA | null = null;
  let origem: Origem | null = null;

  const firstCompra = (itens || []).find((x) => (x as AnyObj).kind === "compra" || (x as AnyObj).modo === "compra") as
    | AnyObj
    | undefined;
  const firstTransf = (itens || []).find(
    (x) => (x as AnyObj).kind === "transferencia" || (x as AnyObj).modo === "transferencia"
  ) as AnyObj | undefined;

  if (isRecord(firstCompra?.data)) {
    const p = str((firstCompra.data as AnyObj).programa);
    if (p === "latam" || p === "smiles") ciaCompra = p;
  }
  if (isRecord(firstTransf?.data)) {
    const d = str((firstTransf.data as AnyObj).destino);
    const o = str((firstTransf.data as AnyObj).origem);
    if (d === "latam" || d === "smiles") destCia = d;
    if (o === "livelo" || o === "esfera") origem = o;
  }

  const totaisId = {
    totalPts: totals.totalPts,
    custoTotal: totals.custoTotal,
    custoMilheiro: totals.custoMilheiro,
    lucroTotal: totals.lucroTotal,
  };

  const compat = { modo, ciaCompra, destCia, origem };

  const totais = {
    totalCIA: totals.totalPts,
    custoTotal: totals.custoTotal,
    custoMilheiroTotal: totals.custoMilheiro,
    lucroTotal: totals.lucroTotal,
  };

  return { itens, totaisId, totais, compat };
}

/** ===================== GET ===================== */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    // /api/compras?id=0001 -> retorna DOC (com totais preenchidos)
    if (id) {
      const item = (await findCompraById(id)) as AnyObj | null;
      if (!item) {
        return NextResponse.json({ error: "Não encontrado" }, { status: 404, headers: noCache() });
      }

      const totaisObj = isRecord(item.totais) ? (item.totais as AnyObj) : undefined;
      const hasPts = num(totaisObj?.totalCIA ?? totaisObj?.pontosCIA) > 0;

      if (!hasPts) {
        const totals = smartTotals((item.itens as unknown[]) || [], item.totais);

        // usa objeto local tipado para evitar spread de tipo possivelmente indefinido
        const totalsIdObj = {
          totalPts: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiro: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        };

        item.totais = {
          totalCIA: totals.totalPts,
          custoTotal: totals.custoTotal,
          custoMilheiroTotal: totals.custoMilheiro,
          lucroTotal: totals.lucroTotal,
        };
        item.totaisId = totalsIdObj;
        item.calculos = { ...totalsIdObj };
      }
      return NextResponse.json(item, { headers: noCache() });
    }

    // listagem + filtros
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const modoFil = url.searchParams.get("modo") || "";
    const ciaFil = url.searchParams.get("cia") || "";
    const origemFil = url.searchParams.get("origem") || "";
    const start = url.searchParams.get("start") || "";
    const end = url.searchParams.get("end") || "";
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

    const all = (await listComprasRaw()) as AnyObj[];

    const firstModo = (r: AnyObj) =>
      str(
        r.modo ??
          (r.itens as AnyObj[] | undefined)?.[0]?.modo ??
          (r.itens as AnyObj[] | undefined)?.[0]?.kind
      );

    const rowCIA = (r: AnyObj): string => {
      const m = firstModo(r);
      if (m === "compra") {
        const v1 = str(r.ciaCompra);
        if (v1) return v1;

        const v2 = (r.itens as AnyObj[] | undefined)?.[0]?.valores as AnyObj | undefined;
        if (isRecord(v2) && v2.ciaCompra) return str(v2.ciaCompra);

        const compra = (r.itens as AnyObj[] | undefined)?.find(
          (x) => str((x as AnyObj).kind) === "compra"
        ) as AnyObj | undefined;
        const v3 = isRecord(compra?.data) ? str((compra.data as AnyObj).programa) : "";
        return v3 || "";
      }
      if (m === "transferencia") {
        const v1 = str(r.destCia);
        if (v1) return v1;

        const v2 = (r.itens as AnyObj[] | undefined)?.[0]?.valores as AnyObj | undefined;
        if (isRecord(v2) && v2.destCia) return str(v2.destCia);

        const transf = (r.itens as AnyObj[] | undefined)?.find(
          (x) => str((x as AnyObj).kind) === "transferencia"
        ) as AnyObj | undefined;
        const v3 = isRecord(transf?.data) ? str((transf.data as AnyObj).destino) : "";
        return v3 || "";
      }
      return "";
    };

    const rowOrigem = (r: AnyObj): string => {
      const v1 = str(r.origem);
      if (v1) return v1;

      const v2 = (r.itens as AnyObj[] | undefined)?.[0]?.valores as AnyObj | undefined;
      if (isRecord(v2) && v2.origem) return str(v2.origem);

      const transf = (r.itens as AnyObj[] | undefined)?.find(
        (x) => str((x as AnyObj).kind) === "transferencia"
      ) as AnyObj | undefined;
      const v3 = isRecord(transf?.data) ? str((transf.data as AnyObj).origem) : "";
      return v3 || "";
    };

    // Normaliza totais por linha (aceitando pontosCIA)
    const normalized = (all || []).map((r) => {
      const totais = isRecord(r.totais) ? (r.totais as AnyObj) : undefined;
      const hasPts = num(totais?.totalCIA ?? totais?.pontosCIA) > 0;
      if (!hasPts) {
        const totals = smartTotals((r.itens as unknown[]) || [], r.totais);
        r = {
          ...r,
          totais: {
            totalCIA: totals.totalPts,
            custoTotal: totals.custoTotal,
            custoMilheiroTotal: totals.custoMilheiro,
            lucroTotal: totals.lucroTotal,
          },
          totaisId: {
            totalPts: totals.totalPts,
            custoTotal: totals.custoTotal,
            custoMilheiro: totals.custoMilheiro,
            lucroTotal: totals.lucroTotal,
          },
          calculos: {
            totalPts: totals.totalPts,
            custoTotal: totals.custoTotal,
            custoMilheiro: totals.custoMilheiro,
            lucroTotal: totals.lucroTotal,
          },
        } as AnyObj;
      } else if (totais?.pontosCIA && !totais?.totalCIA) {
        r = { ...r, totais: { ...totais, totalCIA: num(totais.pontosCIA) } } as AnyObj;
      }
      return r;
    });

    let rows = normalized.slice();

    if (q) {
      rows = rows.filter(
        (r) =>
          str(r.id).toLowerCase().includes(q) ||
          str(r.cedenteId).toLowerCase().includes(q) ||
          str(r.cedenteNome).toLowerCase().includes(q)
      );
    }
    if (modoFil) rows = rows.filter((r) => firstModo(r) === modoFil);
    if (ciaFil) rows = rows.filter((r) => rowCIA(r) === ciaFil);
    if (origemFil) rows = rows.filter((r) => rowOrigem(r) === origemFil);
    if (start) rows = rows.filter((r) => str(r.dataCompra) >= start);
    if (end) rows = rows.filter((r) => str(r.dataCompra) <= end);

    rows.sort((a, b) => {
      const da = str(a.dataCompra);
      const db = str(b.dataCompra);
      if (da < db) return 1;
      if (da > db) return -1;
      return str(a.id).localeCompare(str(b.id));
    });

    const total = rows.length;
    const offsetClamped = Math.max(0, offset);
    const limitClamped = Math.max(1, Math.min(limit, 500));
    const items = rows.slice(offsetClamped, offsetClamped + limitClamped);

    return NextResponse.json({ ok: true, total, items }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao carregar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** ===================== POST (upsert) ===================== */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await req.json();
    const body = isRecord(raw) ? (raw as AnyObj) : {};

    const id = str(body.id);
    const dataCompra = str(body.dataCompra);
    const statusPontos = (str(body.statusPontos) as Status) || "aguardando";
    const cedenteId = str(body.cedenteId);
    const cedenteNome = str(body.cedenteNome);

    const usingNew = Array.isArray(body.itens);
    const { itens, totaisId, totais, compat } = usingNew
      ? normalizeFromNewShape(body)
      : normalizeFromOldShape(body);

    const row: AnyObj = {
      id,
      dataCompra,
      statusPontos,
      cedenteId,
      cedenteNome,

      itens,
      totais, // novo padrão

      // compat p/ listagem antiga
      totaisId,
      modo: compat.modo ?? undefined,
      ciaCompra: compat.ciaCompra ?? undefined,
      destCia: compat.destCia ?? undefined,
      origem: compat.origem ?? undefined,
      calculos: { ...totaisId },

      metaMilheiro: body.metaMilheiro ?? undefined,
      comissaoCedente: body.comissaoCedente ?? undefined,

      savedAt: Date.now(),
    };

    await upsertCompra(row);
    return NextResponse.json({ ok: true, id: row.id }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "erro ao salvar";
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: noCache() });
  }
}

/** ===================== PATCH (?id=) ===================== */
export async function PATCH(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400, headers: noCache() });

  try {
    const patchRaw: unknown = await req.json().catch(() => ({}));
    const apply: AnyObj = isRecord(patchRaw) ? { ...patchRaw } : {};

    // Se vierem itens e não vier `totais`, gere compat/novos; se vier `totais`, gere totaisId/calculos.
    if (Array.isArray(apply.itens) && !apply.totais && !apply.totaisId) {
      const smart = smartTotals(apply.itens as unknown[]);

      const totalsIdObj = {
        totalPts: smart.totalPts,
        custoTotal: smart.custoTotal,
        custoMilheiro: smart.custoMilheiro,
        lucroTotal: smart.lucroTotal,
      };

      apply.totaisId = totalsIdObj;
      apply.calculos = { ...totalsIdObj };
      apply.totais = {
        totalCIA: smart.totalPts,
        custoTotal: smart.custoTotal,
        custoMilheiroTotal: smart.custoMilheiro,
        lucroTotal: smart.lucroTotal,
      };
    }
    if (apply.totais && !apply.totaisId) {
      const compatTot = totalsCompatFromTotais(apply.totais);
      const totalsIdObj = {
        totalPts: compatTot.totalPts,
        custoTotal: compatTot.custoTotal,
        custoMilheiro: compatTot.custoMilheiro,
        lucroTotal: compatTot.lucroTotal,
      };
      apply.totaisId = totalsIdObj;
      apply.calculos = { ...totalsIdObj };
    }

    // Mantém campos compat para a listagem
    const first = Array.isArray(apply.itens) ? (apply.itens as AnyObj[])[0] : undefined;
    if (first) {
      const modo = str(first.modo ?? first.kind);
      apply.modo = modo;
      if (modo === "compra") {
        apply.ciaCompra = str(
          (first.valores as AnyObj | undefined)?.ciaCompra ??
            (first.data as AnyObj | undefined)?.programa ??
            null
        );
        apply.destCia = null;
        apply.origem = null;
      } else if (modo === "transferencia") {
        apply.ciaCompra = null;
        apply.destCia = str(
          (first.valores as AnyObj | undefined)?.destCia ??
            (first.data as AnyObj | undefined)?.destino ??
            null
        );
        apply.origem = str(
          (first.valores as AnyObj | undefined)?.origem ??
            (first.data as AnyObj | undefined)?.origem ??
            null
        );
      }
    }

    const updated = await updateCompraById(id, apply);
    return NextResponse.json(updated, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar";
    const code = /não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code, headers: noCache() });
  }
}

/** ===================== DELETE (?id=) ===================== */
export async function DELETE(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400, headers: noCache() });

  try {
    await deleteCompraById(id);
    return NextResponse.json({ ok: true, deleted: id }, { headers: noCache() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao excluir";
    const code = /não encontrado/i.test(msg) ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code, headers: noCache() });
  }
}
