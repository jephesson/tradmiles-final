// app/api/clientes/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(v: any) {
  return String(v ?? "").replace(/\D+/g, "");
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = (searchParams.get("q") || "").trim();

    if (qRaw.length < 2) {
      return NextResponse.json({ ok: true, clientes: [] });
    }

    const qDigits = onlyDigits(qRaw);

    // Ex: "joao silva" -> ["joao","silva"] (ajuda achar nomes compostos)
    const tokens = qRaw
      .split(/\s+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 5);

    const or: any[] = [
      // ✅ nome (principal)
      { nome: { contains: qRaw, mode: "insensitive" as const } },

      // ✅ identificador (CL00001 etc)
      { identificador: { contains: qRaw, mode: "insensitive" as const } },
    ];

    // ✅ se tiver mais de 1 token, tenta "AND" no nome (João E Silva)
    if (tokens.length > 1) {
      or.push({
        AND: tokens.map((t) => ({ nome: { contains: t, mode: "insensitive" as const } })),
      });
    }

    // ✅ cpf/telefone: comparar por dígitos
    if (qDigits.length >= 2) {
      or.push({ cpfCnpj: { contains: qDigits } });
      or.push({ telefone: { contains: qDigits } });
    }

    const clientes = await prisma.cliente.findMany({
      where: { OR: or },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        identificador: true,
        nome: true,
        cpfCnpj: true,
        telefone: true,
      },
      take: 20,
    });

    return NextResponse.json({ ok: true, clientes });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao buscar clientes." },
      { status: 500 }
    );
  }
}
