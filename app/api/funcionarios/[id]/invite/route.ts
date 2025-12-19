import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeInviteCodeFromName } from "@/lib/inviteCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404 });
  }

  // tenta evitar colisão de code (unique)
  for (let i = 0; i < 8; i++) {
    const code = makeInviteCodeFromName(user.name);

    try {
      const invite = await prisma.employeeInvite.upsert({
        where: { userId: user.id },
        update: { code, isActive: true },
        create: { userId: user.id, code, isActive: true },
        select: { code: true },
      });

      return NextResponse.json({ ok: true, code: invite.code });
    } catch (e: any) {
      // P2002 = unique constraint (colisão de code). tenta novamente.
      if (e?.code === "P2002") continue;
      console.error("POST /api/funcionarios/[id]/invite error:", e);
      return NextResponse.json({ ok: false, error: "Erro ao gerar convite." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "Não foi possível gerar um código único." }, { status: 500 });
}
