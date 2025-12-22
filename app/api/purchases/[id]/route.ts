// app/api/purchases/[id]/route.ts
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

function bad(msg: string, status = 400) {
  return new Response(msg, { status });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const row = await prisma.purchase.findUnique({
    where: { id },
    include: {
      cedente: {
        select: { id: true, nomeCompleto: true, cpf: true, identificador: true },
      },
      items: true,
    },
  });

  if (!row) return bad("Compra não encontrada.", 404);
  return Response.json(row);
}

type PatchBody = {
  status?: "OPEN" | "CLOSED" | "CANCELED";
  note?: string | null;
};

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as PatchBody;

  const updated = await prisma.purchase.update({
    where: { id },
    data: {
      status: body.status,
      note: body.note === undefined ? undefined : body.note ? String(body.note) : null,
    },
  });

  return Response.json(updated);
}
