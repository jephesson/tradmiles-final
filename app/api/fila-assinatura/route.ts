import { NextRequest, NextResponse } from "next/server";
import { CedenteStatus, type AssinaturaStatus, type FilaAssinaturaResultado } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { EXCLUDED_CPF_PREFIX } from "@/lib/cedentes/activeCedenteWhere";
import { isAdminRole } from "@/lib/payouts/resolveViewAs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Fila de assinatura: qualquer um da equipe coloca o cedente;
 * o admin marca LATAM Pass / Livelo e fecha como concluído, negado ou sem resposta
 * (fechado sai da fila).
 */

const STATUSES: AssinaturaStatus[] = ["AGUARDANDO", "ASSINADO", "ERRO"];
const RESULTADOS: FilaAssinaturaResultado[] = ["CONCLUIDO", "NEGADO", "SEM_RESPOSTA"];

function ok(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

function maskCpf(cpf: string) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return "";
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

function cedenteWhere(team: string) {
  return {
    owner: { team },
    status: { in: [CedenteStatus.PENDING, CedenteStatus.APPROVED] },
    NOT: { cpf: { startsWith: EXCLUDED_CPF_PREFIX } },
  };
}

const cedenteSelect = {
  id: true,
  nomeCompleto: true,
  identificador: true,
  cpf: true,
  owner: { select: { id: true, name: true } },
} as const;

function cedenteOut(c: {
  id: string;
  nomeCompleto: string;
  identificador: string;
  cpf: string;
  owner: { id: string; name: string } | null;
}) {
  return {
    id: c.id,
    nome: c.nomeCompleto,
    identificador: c.identificador,
    cpfMask: maskCpf(c.cpf),
    responsavel: c.owner,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const busca = String(req.nextUrl.searchParams.get("busca") || "").trim();

    if (busca) {
      const digits = busca.replace(/\D/g, "");
      const rows = await prisma.cedente.findMany({
        where: {
          ...cedenteWhere(session.team),
          OR: [
            { nomeCompleto: { contains: busca, mode: "insensitive" } },
            { identificador: { contains: busca, mode: "insensitive" } },
            ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : []),
          ],
        },
        select: {
          ...cedenteSelect,
          filaAssinaturas: { where: { concludedAt: null }, select: { id: true }, take: 1 },
        },
        orderBy: { nomeCompleto: "asc" },
        take: 12,
      });
      return ok({
        cedentes: rows.map((c) => ({ ...cedenteOut(c), naFila: c.filaAssinaturas.length > 0 })),
      });
    }

    const items = await prisma.filaAssinatura.findMany({
      where: { team: session.team, concludedAt: null },
      include: {
        cedente: { select: cedenteSelect },
        addedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return ok({
      isAdmin: isAdminRole(session.role),
      meId: session.id,
      items: items.map((i) => ({
        id: i.id,
        latamStatus: i.latamStatus,
        liveloStatus: i.liveloStatus,
        note: i.note || "",
        createdAt: i.createdAt,
        addedBy: i.addedBy,
        cedente: cedenteOut(i.cedente),
      })),
    });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => null);
    const cedenteId = String(body?.cedenteId || "").trim();
    const note = String(body?.note || "").trim().slice(0, 300) || null;
    if (!cedenteId) return bad("Escolha o cedente.");

    const cedente = await prisma.cedente.findFirst({
      where: { id: cedenteId, ...cedenteWhere(session.team) },
      select: { id: true, nomeCompleto: true },
    });
    if (!cedente) return bad("Cedente não encontrado.", 404);

    const open = await prisma.filaAssinatura.findFirst({
      where: { team: session.team, cedenteId, concludedAt: null },
      select: { id: true },
    });
    if (open) return bad(`${cedente.nomeCompleto} já está na fila.`);

    const created = await prisma.filaAssinatura.create({
      data: { team: session.team, cedenteId, note, addedById: session.id },
      select: { id: true },
    });
    return ok({ id: created.id });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isAdminRole(session.role)) return bad("Só o admin marca a assinatura.", 403);

    const id = req.nextUrl.searchParams.get("id") || "";
    const body = await req.json().catch(() => null);
    if (!id || !body) return bad("Pedido inválido.");

    const item = await prisma.filaAssinatura.findFirst({
      where: { id, team: session.team, concludedAt: null },
      select: { id: true },
    });
    if (!item) return bad("Esse cedente não está mais na fila.", 404);

    const data: {
      latamStatus?: AssinaturaStatus;
      liveloStatus?: AssinaturaStatus;
      concludedAt?: Date;
      concludedById?: string;
      resultado?: FilaAssinaturaResultado;
    } = {};
    if (body.latamStatus !== undefined) {
      if (!STATUSES.includes(body.latamStatus)) return bad("Status LATAM inválido.");
      data.latamStatus = body.latamStatus;
    }
    if (body.liveloStatus !== undefined) {
      if (!STATUSES.includes(body.liveloStatus)) return bad("Status Livelo inválido.");
      data.liveloStatus = body.liveloStatus;
    }
    const resultado = body.resultado ?? (body.concluir ? "CONCLUIDO" : undefined);
    if (resultado !== undefined) {
      if (!RESULTADOS.includes(resultado)) return bad("Resultado inválido.");
      data.resultado = resultado;
      data.concludedAt = new Date();
      data.concludedById = session.id;
    }

    await prisma.filaAssinatura.update({ where: { id }, data });
    return ok({ id });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const id = req.nextUrl.searchParams.get("id") || "";
    const item = await prisma.filaAssinatura.findFirst({
      where: { id, team: session.team, concludedAt: null },
      select: { id: true, addedById: true },
    });
    if (!item) return bad("Esse cedente não está mais na fila.", 404);
    if (item.addedById !== session.id && !isAdminRole(session.role)) {
      return bad("Só quem colocou na fila (ou o admin) pode tirar.", 403);
    }
    await prisma.filaAssinatura.delete({ where: { id } });
    return ok({ id });
  } catch (e: unknown) {
    return bad(e instanceof Error ? e.message : "Erro interno.", 500);
  }
}
