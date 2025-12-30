import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cedenteId = searchParams.get("cedenteId") || "";

  const compras = await prisma.purchase.findMany({
    where: {
      status: "OPEN",
      ...(cedenteId ? { cedenteId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      numero: true,
      status: true,
      ciaAerea: true,
      metaMilheiroCents: true,
      custoMilheiroCents: true,
      metaMarkupCents: true,
    },
    take: 80,
  });

  return NextResponse.json({ ok: true, compras });
}
