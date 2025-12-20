import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();

    // ✅ Basta estar logado
    if (!session?.user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // ⚠️ Ajuste o campo conforme seu schema
    const user = await prisma.user.findFirst({
      where: { email: session.user.email ?? "" },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "Erro ao confirmar senha" },
      { status: 500 }
    );
  }
}
