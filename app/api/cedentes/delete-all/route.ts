import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST() {
  const r = await prisma.cedente.deleteMany({});
  return NextResponse.json({ ok: true, deleted: r.count });
}
