import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ token: string }> | { token: string };
};

function extractCode(token: string) {
  const t = String(token || "").trim();
  if (!t) return "";
  // conv-jephesson-aa11a695 -> aa11a695
  const parts = t.split("-").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : t;
}

async function getTokenFromCtx(ctx: Ctx) {
  const p: any = (ctx as any)?.params;
  const resolved = typeof p?.then === "function" ? await p : p;
  return String(resolved?.token ?? "").trim();
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const token = await getTokenFromCtx(ctx);
  const code = extractCode(token);

  if (!code) {
    return NextResponse.json({ ok: false, error: "Token ausente." }, { status: 400 });
  }

  const invite = await prisma.employeeInvite.findUnique({
    where: { code },
    select: {
      code: true,
      isActive: true,
      user: { select: { id: true, name: true, login: true, team: true, role: true } },
    },
  });

  if (!invite) return NextResponse.json({ ok: false, error: "Convite não encontrado." }, { status: 404 });
  if (!invite.isActive) return NextResponse.json({ ok: false, error: "Convite inativo." }, { status: 410 });

  return NextResponse.json({
    ok: true,
    data: { code: invite.code, user: invite.user },
  });
}
