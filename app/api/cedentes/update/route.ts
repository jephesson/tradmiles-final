import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  const { id, data } = await req.json();

  if (!id || !data) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const updated = await prisma.cedente.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, data: updated });
}
