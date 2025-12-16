import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

// 🔒 Você precisa adaptar isso ao seu auth atual
async function getLoggedUserId(req: NextRequest): Promise<string | null> {
  // exemplo: cookie/session/jwt etc.
  // return userId
  return null;
}

export async function POST(req: NextRequest) {
  const userId = await getLoggedUserId(req);
  if (!userId) return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rotate = body?.rotate === true;

  const existing = await prisma.employeeInvite.findUnique({ where: { userId } });

  let invite = existing;

  if (!invite || rotate) {
    const code = crypto.randomBytes(16).toString("hex"); // curto e bom
    invite = await prisma.employeeInvite.upsert({
      where: { userId },
      create: { userId, code },
      update: { code, isActive: true },
    });
  }

  const url = `${baseUrl(req)}/convite/${invite.code}`;

  return NextResponse.json({ ok: true, data: { url, code: invite.code } });
}
