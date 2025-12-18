import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ token: string }>;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { token } = await ctx.params;
    const code = String(token || "").trim();
    const body = await req.json();

    if (!body?.accepted) {
      return NextResponse.json({ ok: false, error: "Termo não aceito." }, { status: 400 });
    }

    const invite = await prisma.employeeInvite.findUnique({
      where: { code },
      select: { isActive: true, userId: true },
    });

    if (!invite || !invite.isActive) {
      return NextResponse.json({ ok: false, error: "Convite inválido." }, { status: 404 });
    }

    await prisma.cedente.create({
      data: {
        nomeCompleto: body.nomeCompleto,
        cpf: onlyDigits(body.cpf),
        dataNascimento: body.dataNascimento ? new Date(body.dataNascimento) : null,
        ownerId: invite.userId,
        status: "PENDING",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
