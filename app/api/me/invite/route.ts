// app/api/me/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function b64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

function getSession(req: NextRequest): { id: string; login: string; role: string; team: string } | null {
  const raw = req.cookies.get("tm.session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(b64urlDecode(raw));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sess = getSession(req);
  if (!sess?.id) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: sess.id },
    select: {
      id: true,
      login: true,
      employeeInvite: { select: { code: true, isActive: true } },
    },
  });

  if (!user) return NextResponse.json({ ok: false, error: "Usuário não encontrado." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    data: {
      userId: user.id,
      login: user.login,
      inviteCode: user.employeeInvite?.code ?? null,
      inviteActive: user.employeeInvite?.isActive ?? false,
    },
  });
}
