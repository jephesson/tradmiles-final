import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const cedenteId = String(body?.cedenteId || "").trim();

  if (!cedenteId) {
    return json({ ok: false, error: "cedenteId é obrigatório." }, 400);
  }

  // garante cedente
  const cedente = await prisma.cedente.findUnique({
    where: { id: cedenteId },
    select: { id: true },
  });

  if (!cedente) {
    return json({ ok: false, error: "Cedente não encontrado." }, 404);
  }

  try {
    const compra = await prisma.$transaction(async (tx) => {
      // 🔢 incrementa contador
      const counter = await tx.counter.upsert({
        where: { key: "purchase" },
        update: { value: { increment: 1 } },
        create: { key: "purchase", value: 1 },
      });

      const numero = `ID${String(counter.value).padStart(5, "0")}`;

      return tx.purchase.create({
        data: {
          cedenteId,
          numero,
          status: "OPEN",
        },
        select: {
          id: true,
          numero: true,
          status: true,
          createdAt: true,
        },
      });
    });

    return json({ ok: true, compra }, 201);
  } catch (err) {
    console.error("ERRO CREATE PURCHASE:", err);
    return json({ ok: false, error: "Falha ao criar compra." }, 500);
  }
}
