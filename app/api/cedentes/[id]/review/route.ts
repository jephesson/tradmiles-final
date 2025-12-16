import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();

  const action = String(body.action || "");
  if (action !== "APPROVE" && action !== "REJECT") {
    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  }

  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

  const updated = await prisma.cedente.update({
    where: { id },
    data: {
      status,
      reviewedAt: new Date(),
      // reviewedById: TODO (quando você quiser, eu pego do seu auth server-side)
    },
  });

  return NextResponse.json({ ok: true, data: updated });
}
