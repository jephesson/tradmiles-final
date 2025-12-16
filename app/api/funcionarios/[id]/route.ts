import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: { employeeInvite: true },
    });

    if (!user) {
      return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        name: user.name,
        cpf: (user as any).cpf ?? null, // se você adicionou cpf no schema, troca pra user.cpf
        login: user.login,
        team: user.team,
        role: user.role,
        inviteCode: user.employeeInvite?.code ?? "",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const cpf = onlyDigits(typeof body?.cpf === "string" ? body.cpf : "");
    const login = typeof body?.login === "string" ? body.login.trim().toLowerCase() : "";
    const team = typeof body?.team === "string" ? body.team.trim() : "";
    const role = body?.role === "admin" ? "admin" : "staff";

    if (!name) return NextResponse.json({ ok: false, error: "Nome obrigatório." }, { status: 400 });
    if (cpf.length !== 11) return NextResponse.json({ ok: false, error: "CPF inválido." }, { status: 400 });
    if (!login) return NextResponse.json({ ok: false, error: "Login obrigatório." }, { status: 400 });
    if (!team) return NextResponse.json({ ok: false, error: "Time obrigatório." }, { status: 400 });

    const exists = await prisma.user.findUnique({ where: { id: params.id } });
    if (!exists) return NextResponse.json({ ok: false, error: "Funcionário não encontrado." }, { status: 404 });

    const data: any = {
      name,
      login,
      team,
      role,
      // se tiver cpf no schema:
      cpf,
    };

    if (typeof body?.password === "string" && body.password.trim()) {
      data.passwordHash = sha256(body.password);
    }

    // evita conflito de login
    const other = await prisma.user.findUnique({ where: { login } });
    if (other && other.id !== params.id) {
      return NextResponse.json({ ok: false, error: "Esse login já está em uso." }, { status: 409 });
    }

    // se tiver cpf no schema e for unique, valida também
    if (cpf) {
      const anyCpf = await prisma.user.findFirst({ where: { cpf } as any });
      if (anyCpf && anyCpf.id !== params.id) {
        return NextResponse.json({ ok: false, error: "Esse CPF já está em uso." }, { status: 409 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data,
      include: { employeeInvite: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        id: updated.id,
        name: updated.name,
        cpf: (updated as any).cpf ?? null,
        login: updated.login,
        team: updated.team,
        role: updated.role,
        inviteCode: updated.employeeInvite?.code ?? "",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro" }, { status: 500 });
  }
}
