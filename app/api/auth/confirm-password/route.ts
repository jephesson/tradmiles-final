import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";

export async function POST(req: Request) {
  const { password } = await req.json();
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) {
    return NextResponse.json({ ok: false, error: "Senha inválida" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
