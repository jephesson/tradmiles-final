import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = String(params?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || "").trim().toUpperCase();

    if (!["UNBLOCKED", "CANCELED", "OPEN"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Status inválido." }, { status: 400 });
    }

    const updated = await prisma.blockedAccount.update({
      where: { id },
      data: {
        status: status as any,
        resolvedAt: status === "OPEN" ? null : new Date(),
      },
      select: { id: true, status: true, resolvedAt: true },
    });

    return NextResponse.json({ ok: true, data: updated }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || "Erro." }, { status: 500 });
  }
}
