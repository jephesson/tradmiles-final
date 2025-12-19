import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function slugify(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function makeInviteCodeFromName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] || "user";
  const second = parts[1] || "convite";
  const base = slugify(`${first}-${second}`);
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}-${suffix}`;
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params; // 👈 AQUI É A CHAVE

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true },
  });

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Funcionário não encontrado." },
      { status: 404 }
    );
  }

  for (let i = 0; i < 10; i++) {
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
      if (e?.code === "P2002") continue; // colisão de code
      console.error("Erro gerar convite:", e);
      return NextResponse.json(
        { ok: false, error: "Erro ao gerar convite." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Falha ao gerar um código único." },
    { status: 500 }
  );
}
