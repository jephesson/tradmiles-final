import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { alertEndISO, todayRecifeISO } from "@/lib/alerts/scheduled";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: H });

const SELECT = {
  id: true,
  title: true,
  notes: true,
  date: true,
  time: true,
  durationMinutes: true,
  cedente: { select: { id: true, nomeCompleto: true, identificador: true } },
  linkedUser: { select: { id: true, name: true, login: true } },
} as const;

/** Alertas do próprio usuário que ainda não terminaram (em andamento + próximos). */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const today = todayRecifeISO();
  // Pega com folga de 31 dias para trás (alertas de vários dias que começaram antes).
  const from = new Date(Date.now() - 31 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Recife" });
  const rows = await prisma.scheduledAlert.findMany({
    where: { userId: session.id, date: { gte: from } },
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
    select: SELECT,
  });
  const data = rows.filter((r) => alertEndISO(r) >= today);
  return NextResponse.json({ ok: true, data, today }, { headers: H });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim().slice(0, 200);
  const notes = String(body?.notes || "").trim().slice(0, 1000) || null;
  const date = String(body?.date || "").trim();
  const timeRaw = String(body?.time || "").trim();
  const dur = body?.durationMinutes == null || body.durationMinutes === "" ? null : Number(body.durationMinutes);

  if (!title) return bad("Escreva o que vai fazer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("Data inválida.");
  if (timeRaw && !/^\d{2}:\d{2}$/.test(timeRaw)) return bad("Hora inválida.");
  if (dur != null && (!Number.isFinite(dur) || dur <= 0 || dur > 60 * 24 * 60)) return bad("Duração inválida.");

  const cedenteId = String(body?.cedenteId || "").trim() || null;
  const linkedUserId = String(body?.linkedUserId || "").trim() || null;
  if (cedenteId) {
    const ok = await prisma.cedente.findUnique({ where: { id: cedenteId }, select: { id: true } });
    if (!ok) return bad("Cedente não encontrado.");
  }
  if (linkedUserId) {
    const ok = await prisma.user.findFirst({ where: { id: linkedUserId, team: session.team }, select: { id: true } });
    if (!ok) return bad("Funcionário não encontrado.");
  }

  const item = await prisma.scheduledAlert.create({
    data: {
      team: session.team,
      userId: session.id,
      title,
      notes,
      date,
      time: timeRaw || null,
      durationMinutes: dur == null ? null : Math.round(dur),
      cedenteId,
      linkedUserId,
    },
    select: SELECT,
  });
  return NextResponse.json({ ok: true, data: item }, { headers: H });
}
