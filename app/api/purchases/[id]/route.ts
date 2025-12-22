// app/api/purchases/[id]/route.ts
import { prisma } from "@/lib/prisma";

function bad(msg: string, status = 400) {
  return new Response(msg, { status });
}

export async function GET(_: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
  const row = await prisma.purchase.findUnique({
    where: { id },
    include: {
      cedente: { select: { id: true, nomeCompleto: true, cpf: true, identificador: true } },
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

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const id = ctx.params.id;
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
