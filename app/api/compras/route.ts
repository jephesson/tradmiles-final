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

  const cedenteId = (body?.cedenteId || "").trim();
  if (!cedenteId) {
    return json({ ok: false, error: "cedenteId é obrigatório." }, 400);
  }

  // garante que o cedente existe
  const cedente = await prisma.cedente.findUnique({
    where: { id: cedenteId },
    select: { id: true },
  });

  if (!cedente) {
    return json({ ok: false, error: "Cedente não encontrado." }, 404);
  }

  // cria a compra (id = cuid + numero sequencial autoincrement)
  const compra = await prisma.purchase.create({
    data: {
      cedenteId,
      status: "OPEN",
    },
    select: {
      id: true,
      numero: true, // ✅ ID humano sequencial
      status: true,
      cedenteId: true,
      createdAt: true,
    },
  });

  return json({ ok: true, compra }, 201);
}
