import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { ids } = await req.json();

  if (!Array.isArray(ids) || !ids.length) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const r = await prisma.cedente.deleteMany({
    where: { id: { in: ids } },
  });

  return NextResponse.json({ ok: true, deleted: r.count });
}
