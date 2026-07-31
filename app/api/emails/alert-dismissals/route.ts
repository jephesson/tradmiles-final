import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function asDismissMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
    const iso = String(at || "");
    const t = new Date(iso).getTime();
    if (!id || !Number.isFinite(t) || t < cutoff) continue;
    out[String(id)] = iso;
  }
  return out;
}

function asByUser(raw: unknown): Record<string, Record<string, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [userId, map] of Object.entries(raw as Record<string, unknown>)) {
    if (!userId) continue;
    out[userId] = asDismissMap(map);
  }
  return out;
}

async function loadPrefsRow() {
  return prisma.emailAlertPrefs.findUnique({ where: { id: "default" } });
}

export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const row = await loadPrefsRow();
  const byUser = asByUser(row?.dismissedByUser);
  const dismissed = byUser[session.userId] || {};

  return NextResponse.json({
    ok: true,
    data: { dismissed },
  });
}

/** Marca um ou mais alertas como ignorados/tratados para o usuário atual. */
export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.messageIds)
    ? body.messageIds.map(String).filter(Boolean)
    : body?.messageId
      ? [String(body.messageId)]
      : [];

  if (!ids.length) return bad("messageId obrigatório.");

  const at = new Date().toISOString();
  const row = await loadPrefsRow();
  const byUser = asByUser(row?.dismissedByUser);
  const mine = { ...(byUser[session.userId] || {}) };
  for (const id of ids.slice(0, 40)) mine[id] = at;
  byUser[session.userId] = asDismissMap(mine);

  await prisma.emailAlertPrefs.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      dismissedByUser: byUser,
      updatedById: session.userId,
    },
    update: {
      dismissedByUser: byUser,
      updatedById: session.userId,
    },
  });

  return NextResponse.json({
    ok: true,
    data: { dismissed: byUser[session.userId] || {} },
  });
}
