import { prisma } from "@/lib/prisma";
import { ok, badRequest, notFound } from "@/lib/api";
import { getSessionServer } from "@/lib/auth-server";
import { parseBRLToCents } from "@/lib/cedenteCommissions/split";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const session = await getSessionServer();
    const userId = String(session?.id || "");
    if (!userId) return badRequest("Sessão inválida: faça login novamente.");
    if (!id) return badRequest("id é obrigatório.");

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const employeeUserId = String(body?.employeeUserId || "").trim();
    let employeeShareCents = 0;
    if (body?.employeeShareCents != null && body.employeeShareCents !== "") {
      employeeShareCents = Math.round(Number(body.employeeShareCents));
    } else {
      employeeShareCents = parseBRLToCents(body?.employeeAmount || body?.amount);
    }

    if (!employeeUserId) return badRequest("Escolha o funcionário.");
    if (!Number.isFinite(employeeShareCents) || employeeShareCents <= 0) {
      return badRequest("Informe quanto vai para o funcionário.");
    }

    const current = await prisma.cedenteCommission.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        amountCents: true,
        employeeShareCents: true,
        employeeSharePaidAt: true,
        note: true,
        interPixPayments: {
          where: { status: { in: ["CREATED", "AWAITING_APPROVAL", "PROCESSING"] } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!current) return notFound("Comissão não encontrada.");
    if (current.status !== "PENDING") {
      return badRequest("Só dá para dividir comissão pendente.");
    }
    if (current.employeeSharePaidAt) {
      return badRequest("A parte do funcionário já foi paga.");
    }
    if (current.interPixPayments.length) {
      return badRequest("Há um PIX em andamento. Espere ou cancele antes de dividir.");
    }
    if (employeeShareCents >= current.amountCents) {
      return badRequest("A parte do funcionário tem que ser menor que o valor gerado.");
    }

    const employee = await prisma.user.findFirst({
      where: {
        id: employeeUserId,
        role: { not: "socio" },
        isActive: true,
      },
      select: { id: true, name: true, login: true },
    });
    if (!employee) return badRequest("Funcionário não encontrado.");

    const cedenteCents = current.amountCents - employeeShareCents;
    const money = (cents: number) =>
      (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const trail = `Divisão: ${money(cedenteCents)} cedente + ${money(employeeShareCents)} ${employee.name} (${employee.login})`;
    const note = current.note?.includes("Divisão:")
      ? current.note.replace(/Divisão:.*$/, trail).trim()
      : [current.note, trail].filter(Boolean).join(" · ");

    const updated = await prisma.cedenteCommission.update({
      where: { id },
      data: {
        employeeShareCents,
        splitEmployeeUserId: employee.id,
        splitAt: new Date(),
        splitById: userId,
        note,
      },
      include: {
        cedente: { select: { id: true, nomeCompleto: true, identificador: true } },
        splitEmployee: { select: { id: true, name: true, login: true } },
        splitBy: { select: { id: true, name: true, login: true } },
      },
    });

    return ok({ commission: updated });
  } catch (e: unknown) {
    return badRequest(e instanceof Error ? e.message : "Falha ao dividir.");
  }
}
