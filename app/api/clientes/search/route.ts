import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, clientes: [] });

  const clientes = await prisma.cliente.findMany({
    where: {
      OR: [
        { nome: { contains: q, mode: "insensitive" } },
        { cpfCnpj: { contains: q } },
        { telefone: { contains: q } },
        { identificador: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, identificador: true, nome: true, cpfCnpj: true, telefone: true },
    take: 20,
  });

  return NextResponse.json({ ok: true, clientes });
}
