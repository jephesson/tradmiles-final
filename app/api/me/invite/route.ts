import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session?.id) {
      return NextResponse.json(
        { ok: false, error: "Não autenticado." },
        { status: 401 }
      );
    }

    // 🔎 Busca convite do funcionário logado
    const invite = await prisma.employeeInvite.findUnique({
      where: { userId: session.id },
      select: {
        id: true,
        code: true,
        isActive: true,
        uses: true,
        lastUsedAt: true,
      },
    });

    // ❌ NÃO EXISTE convite → erro orientado
    if (!invite) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Este funcionário ainda não possui código de convite. Solicite a criação na aba Funcionários.",
        },
        { status: 422 }
      );
    }

    if (!invite.isActive) {
      return NextResponse.json(
        {
          ok: false,
          error: "O código de convite deste funcionário está desativado.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        inviteId: invite.id,
        inviteCode: invite.code, // ✅ exatamente o que o frontend usa
        uses: invite.uses,
        lastUsedAt: invite.lastUsedAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar convite." },
      { status: 500 }
    );
  }
}
