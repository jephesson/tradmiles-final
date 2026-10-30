import { NextResponse } from "next/server";
import { getSessionServer } from "@/lib/auth-server";
import { prisma } from "@/lib/prisma";
import { cedentePixDraft, employeePixDestino } from "@/lib/inter/destino";
import { cedenteShareCents } from "@/lib/cedenteCommissions/split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionServer();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const share = new URL(_req.url).searchParams.get("share") || "";
  const row = await prisma.cedenteCommission.findUnique({
    where: { id },
    select: {
      cedenteId: true,
      amountCents: true,
      status: true,
      employeeShareCents: true,
      splitEmployeeUserId: true,
    },
  });
  if (!row) {
    return NextResponse.json({ ok: false, error: "Comissão não encontrada." }, { status: 404 });
  }
  try {
    if (share === "employee") {
      if (!row.splitEmployeeUserId || row.employeeShareCents <= 0) {
        return NextResponse.json(
          { ok: false, error: "Essa comissão não está dividida com funcionário." },
          { status: 400 }
        );
      }
      try {
        const destino = await employeePixDestino(row.splitEmployeeUserId);
        return NextResponse.json({
          ok: true,
          amountCents: row.employeeShareCents,
          status: row.status,
          share: "employee",
          destino,
          needsPix: false,
          pixError: null,
        });
      } catch (e) {
        return NextResponse.json({
          ok: true,
          amountCents: row.employeeShareCents,
          status: row.status,
          share: "employee",
          destino: {
            nome: "Funcionário",
            cpf: null,
            banco: null,
            pixTipo: "CPF",
            pixKey: "",
            source: "cadastro do funcionário",
            cpfMatchesKey: null,
          },
          needsPix: true,
          pixError: e instanceof Error ? e.message : "Funcionário sem chave PIX.",
        });
      }
    }

    const draft = await cedentePixDraft(row.cedenteId);
    return NextResponse.json({
      ok: true,
      amountCents: cedenteShareCents(row.amountCents, row.employeeShareCents),
      status: row.status,
      share: "cedente",
      destino: draft.destino,
      needsPix: draft.needsPix,
      pixError: draft.error,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Falha ao ler PIX." },
      { status: 400 }
    );
  }
}
