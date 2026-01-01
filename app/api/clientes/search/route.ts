import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function norm(v?: string | null) {
  return (v || "").trim();
}
function onlyDigits(v?: string | null) {
  return String(v || "").replace(/\D+/g, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const qRaw = norm(searchParams.get("q"));
    const q = qRaw;
    const qDigits = onlyDigits(qRaw);

    const recent = searchParams.get("recent") === "1";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "20"), 1), 50);

    const shouldRecent = recent || q.length < 2;

    const where = shouldRecent
      ? undefined
      : {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { identificador: { contains: q, mode: "insensitive" } },
            ...(qDigits
              ? [
                  { cpfCnpj: { contains: qDigits, mode: "insensitive" } },
                  { telefone: { contains: qDigits, mode: "insensitive" } },
                ]
              : []),
          ],
        };

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        identificador: true,
        nome: true,
        cpfCnpj: true,
        telefone: true,
      },
    });

    return NextResponse.json({ ok: true, clientes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao buscar clientes" }, { status: 500 });
  }
}
