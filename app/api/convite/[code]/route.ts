import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: { code: string } | Promise<{ code: string }>;
};

async function getCodeFromCtx(ctx: Ctx) {
  const p: any = ctx?.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return String(resolved?.code ?? "").trim();
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const code = await getCodeFromCtx(ctx);
  if (!code) {
    return NextResponse.json({ ok: false, error: "Código ausente." }, { status: 400 });
  }

  const invite = await prisma.employeeInvite.findUnique({
    where: { code },
    select: {
      code: true,
      isActive: true,
      user: { select: { id: true, name: true, login: true, team: true, role: true } },
    },
  });

  if (!invite) {
    return NextResponse.json({ ok: false, error: "Convite não encontrado." }, { status: 404 });
  }

  if (!invite.isActive) {
    return NextResponse.json({ ok: false, error: "Convite inativo." }, { status: 410 });
  }

  return NextResponse.json({
    ok: true,
    data: { code: invite.code, user: invite.user },
  });
}
