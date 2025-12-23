import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function formatNumero(n: number) {
  return `ID${String(n).padStart(5, "0")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const cedenteId = String(body?.cedenteId || "").trim();
  if (!cedenteId) return json({ ok: false, error: "cedenteId é obrigatório." }, 400);

  const cedente = await prisma.cedente.findUnique({
    where: { id: cedenteId },
    select: { id: true },
  });
  if (!cedente) return json({ ok: false, error: "Cedente não encontrado." }, 404);

  const compra = await prisma.$transaction(async (tx) => {
    // garante que existe o contador "purchase"
    const counter = await tx.counter.upsert({
      where: { key: "purchase" },
      update: {},
      create: { key: "purchase", value: 0 },
      select: { value: true },
    });

    // incrementa atomico
    const next = await tx.counter.update({
      where: { key: "purchase" },
      data: { value: { increment: 1 } },
      select: { value: true },
    });

    const numero = formatNumero(next.value);

    const created = await tx.purchase.create({
      data: {
        cedenteId,
        status: "OPEN",
        numero,
      },
      select: {
        id: true,
        numero: true,
        status: true,
        cedenteId: true,
        createdAt: true,
      },
    });

    return created;
  });

  return json({ ok: true, compra }, 201);
}
