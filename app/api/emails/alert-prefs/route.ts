import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function asArray(v: unknown) {
  return Array.isArray(v) ? v : [];
}

export async function GET(req: Request) {
  try {
    requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const row = await prisma.emailAlertPrefs.findUnique({
    where: { id: "default" },
  });

  return NextResponse.json({
    ok: true,
    data: {
      alertFilterIds: asArray(row?.alertFilterIds),
      alertFilters: asArray(row?.alertFilters),
      actionConfigs: asArray(row?.actionConfigs),
      updatedAt: row?.updatedAt?.toISOString() || null,
    },
  });
}

export async function PUT(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const body = await req.json().catch(() => ({}));
  const alertFilterIds = asArray(body?.alertFilterIds).map(String).slice(0, 40);
  const alertFilters = asArray(body?.alertFilters).slice(0, 40);
  const actionConfigs = asArray(body?.actionConfigs).slice(0, 40);

  const saved = await prisma.emailAlertPrefs.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      alertFilterIds,
      alertFilters,
      actionConfigs,
      updatedById: session.userId,
    },
    update: {
      alertFilterIds,
      alertFilters,
      actionConfigs,
      updatedById: session.userId,
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      alertFilterIds: asArray(saved.alertFilterIds),
      alertFilters: asArray(saved.alertFilters),
      actionConfigs: asArray(saved.actionConfigs),
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
}
