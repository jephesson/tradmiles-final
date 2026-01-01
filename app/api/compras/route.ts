import { prisma } from "@/lib/prisma";
import { ok, badRequest, serverError } from "@/lib/api";
import { nextNumeroCompra } from "@/lib/compraNumero";
import { recomputeCompra } from "@/lib/compras";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function asInt(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.trunc(x) : fallback;
}

/**
 * Normaliza uma "purchase" do Prisma para o shape esperado pelo ComprasClient
 * (compat com campos antigos/novos)
 */
function toPurchaseRow(p: any) {
  return {
    id: p.id,
    numero: p.numero,
    status: p.status,
    createdAt: p.createdAt, // Date -> JSON vira ISO automaticamente

    // compat: pode existir com nomes antigos
    ciaProgram: p.ciaProgram ?? p.ciaAerea ?? null,
    ciaPointsTotal: asInt(p.ciaPointsTotal ?? p.pontosCiaTotal ?? 0),

    // totals (compat com nomes diferentes)
    totalCostCents: asInt(p.totalCostCents ?? p.totalCost ?? p.totalCents ?? 0),

    cedente: p.cedente
      ? {
          id: p.cedente.id,
          nomeCompleto: p.cedente.nomeCompleto,
          cpf: p.cedente.cpf,
          identificador: p.cedente.identificador,
        }
      : null,
  };
}

function normQ(v?: string | null) {
  const s = String(v || "").trim();
  return s.length ? s : "";
}

function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const cedenteId = searchParams.get("cedenteId") || undefined;
    const status = searchParams.get("status") || undefined;

    // ✅ NOVO: busca do frontend (?q=...)
    const q = normQ(searchParams.get("q"));

    const take = Math.min(asInt(searchParams.get("take") || 50, 50), 200);
    const skip = Math.max(0, asInt(searchParams.get("skip") || 0, 0));

    const qDigits = q ? digitsOnly(q) : "";

    // ✅ where base (não muda nada do que já existia)
    const where: Prisma.PurchaseWhereInput = {
      ...(cedenteId ? { cedenteId } : {}),
      ...(status ? { status: status as any } : {}),
    };

    // ✅ filtro de busca (aditivo; se não tiver q, nada muda)
    if (q) {
      // busca por numero/id/cia e também por cedente (nome/cpf/identificador)
      const or: Prisma.PurchaseWhereInput[] = [
        { numero: { contains: q, mode: "insensitive" } },
        { id: { contains: q, mode: "insensitive" } },
        { ciaAerea: { contains: q, mode: "insensitive" } },
        { ciaProgram: { contains: q, mode: "insensitive" } },
        {
          cedente: {
            is: { nomeCompleto: { contains: q, mode: "insensitive" } },
          },
        },
        {
          cedente: {
            is: { identificador: { contains: q, mode: "insensitive" } },
          },
        },
      ];

      // se tiver dígitos, tenta CPF/ID por contains também
      if (qDigits.length >= 2) {
        or.push({
          cedente: {
            is: { cpf: { contains: qDigits } },
          },
        });
        or.push({
          cedente: {
            is: { identificador: { contains: qDigits, mode: "insensitive" } },
          },
        });
      }

      where.OR = or;
    }

    const compras = await prisma.purchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
            identificador: true,
          },
        },
        // ✅ listagem não precisa de items; deixa leve
        // items: true,
      },
    });

    const comprasOut = compras.map((p) => toPurchaseRow(p));
    return ok({ compras: comprasOut });
  } catch (e: any) {
    return serverError("Falha ao listar compras.", { detail: e?.message });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest("JSON inválido.");

    const cedenteId = String(body.cedenteId || "");
    if (!cedenteId) return badRequest("cedenteId é obrigatório.");

    const numero = await nextNumeroCompra();

    // ✅ compat: aceitar nomes antigos e novos
    const ciaProgram = body.ciaProgram ?? body.ciaAerea ?? null;
    const ciaPointsTotal = asInt(body.ciaPointsTotal ?? body.pontosCiaTotal ?? 0);

    const cedentePayCents = asInt(body.cedentePayCents ?? 0);
    const vendorCommissionBps = asInt(body.vendorCommissionBps ?? 100);
    const metaMarkupCents = asInt(body.metaMarkupCents ?? body.targetMarkupCents ?? 150);

    const observacao =
      body.observacao != null
        ? String(body.observacao)
        : body.note != null
        ? String(body.note)
        : null;

    const compra = await prisma.purchase.create({
      data: {
        numero,
        cedenteId,
        status: "OPEN", // ✅ OPEN = pendente (ainda não liberada)

        // ✅ salva nos campos do teu schema atual (pelos teus nomes atuais)
        ciaAerea: ciaProgram,
        pontosCiaTotal: ciaPointsTotal,

        cedentePayCents,
        vendorCommissionBps,
        metaMarkupCents,

        observacao,
      },
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
            identificador: true,
          },
        },
      },
    });

    // ✅ garante totais atualizados
    await recomputeCompra(compra.id);

    // ✅ busca final (já com totais recalculados)
    const compraFinal = await prisma.purchase.findUnique({
      where: { id: compra.id },
      include: {
        cedente: {
          select: {
            id: true,
            nomeCompleto: true,
            cpf: true,
            identificador: true,
          },
        },
      },
    });

    if (!compraFinal) return serverError("Falha ao carregar compra criada.");

    // ✅ devolve no shape do frontend (CompraRow)
    return ok({ compra: toPurchaseRow(compraFinal) }, 201);
  } catch (e: any) {
    return serverError("Falha ao criar compra.", { detail: e?.message });
  }
}
