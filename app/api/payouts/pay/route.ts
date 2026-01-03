import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function parseISODateToUTC0(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const userId = String(body?.userId || "").trim();
    const dateStr = String(body?.date || "").trim();
    const status = String(body?.status || "").trim(); // "PAID" | "PENDING"
    const paidById = body?.paidById ? String(body.paidById).trim() : null;

    if (!userId || !dateStr || !status) {
      return NextResponse.json(
        { ok: false, error: "userId, date e status obrigatórios" },
        { status: 400 }
      );
    }

    const dateOnly = parseISODateToUTC0(dateStr);
    if (!dateOnly) {
      return NextResponse.json({ ok: false, error: "date inválido. Use YYYY-MM-DD" }, { status: 400 });
    }

    if (status !== "PAID" && status !== "PENDING") {
      return NextResponse.json({ ok: false, error: "status deve ser PAID ou PENDING" }, { status: 400 });
    }

    const where = { date_userId: { date: dateOnly, userId } }; // ✅ UNIQUE CORRETA

    const data =
      status === "PAID"
        ? {
            paidById: paidById || userId, // se não mandar, marca como o próprio (ajusta se tu preferir)
            paidAt: new Date(),
          }
        : {
            paidById: null,
            // paidAt: não mexe (evita problema se não for nullable)
          };

    const updated = await prisma.employeePayout.update({ where, data });

    return NextResponse.json({
      ok: true,
      userId,
      date: dateStr,
      status: updated.paidById ? "PAID" : "PENDING",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro interno" }, { status: 500 });
  }
}
