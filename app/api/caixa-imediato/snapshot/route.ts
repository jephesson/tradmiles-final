import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
  name?: string;
};

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function parseCapturedAt(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return new Date();
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.team) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });

  const capturedAt = parseCapturedAt(body.capturedAt);
  const date = capturedAt.toISOString();

  const cashCents = safeInt(body.cashCents, 0);
  const totalBrutoCents = safeInt(body.totalBrutoCents, 0);
  const totalDividasCents = safeInt(body.totalDividasCents, 0);
  const totalLiquidoCents = safeInt(body.totalLiquidoCents ?? body.totalImediatoCents, 0);

  await prisma.caixaImediatoSnapshot.create({
    data: {
      team: session.team,
      date,
      cashCents,
      totalBrutoCents,
      totalDividasCents,
      totalLiquidoCents,
    },
  });

  return NextResponse.json({ ok: true });
}
