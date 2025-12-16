import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, login: true, team: true, role: true, email: true },
    });

    if (!user) return NextResponse.json({ ok: false, error: "Não encontrado." }, { status: 404 });

    const invite = await prisma.employeeInvite.findUnique({
      where: { userId: id },
      select: { code: true, isActive: true },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          ...user,
          inviteCode: invite?.code ?? null,
          inviteActive: invite?.isActive ?? false,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");
    const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
    const team = typeof body?.team === "string" ? body.team.trim() : "";
    const role = typeof body?.role === "string" ? body.role.trim() : "staff";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name) return NextResponse.json({ ok: false, error: "Nome obrigatório." }, { status: 400 });
    if (cpf && cpf.length !== 11) return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
    if (!login) return NextResponse.json({ ok: false, error: "Login obrigatório." }, { status: 400 });
    if (!team) return NextResponse.json({ ok: false, error: "Time obrigatório." }, { status: 400 });

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        login,
        team,
        role,
        ...(cpf ? ({ cpf } as any) : {}), // se você tiver cpf no model User; se não tiver, apaga essa linha
        ...(password ? { passwordHash: sha256(password) } : {}),
      } as any,
      select: { id: true, name: true, login: true, team: true, role: true },
    });

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "Erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;

    await prisma.employeeInvite.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
