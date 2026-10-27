import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { isAdminRole } from "@/lib/payouts/resolveViewAs";
import { officialHolidayName, officialHolidaysInRange } from "@/lib/agenda/holidays";
import { isWeekendISO } from "@/lib/agenda/shifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
function ok(data: unknown) {
  return NextResponse.json({ ok: true, data }, { headers: noCacheHeaders() });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: noCacheHeaders() });
}

function brToISO(ddmmyyyy: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmyyyy || "").trim());
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const de = url.searchParams.get("de") || "";
    const ate = url.searchParams.get("ate") || "";
    const startISO = /^\d{4}-\d{2}-\d{2}$/.test(de) ? de : brToISO(de);
    const endISO = /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : brToISO(ate);

    const [validatedRows] = await Promise.all([
      prisma.agendaHoliday.findMany({
        where: { team: session.team },
        select: { dateISO: true, name: true, validatedAt: true },
      }),
    ]);
    const validated = new Set(validatedRows.map((r) => r.dateISO));

    const official =
      startISO && endISO
        ? officialHolidaysInRange(startISO, endISO).map((h) => ({
            ...h,
            validated: validated.has(h.dateISO),
          }))
        : [];

    return ok({
      canValidate: isAdminRole(session.role),
      validated: validatedRows.map((r) => r.dateISO),
      holidays: official,
    });
  } catch (e: any) {
    return bad(e?.message || "Erro interno.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isAdminRole(session.role)) return bad("Só o admin valida feriado.", 403);

    const body = await req.json().catch(() => null);
    if (!body) return bad("JSON inválido.");

    const raw = String(body.dateISO || body.date || "").trim();
    const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : brToISO(raw);
    const name = officialHolidayName(dateISO);
    if (!name) return bad("Só feriado nacional oficial pode ser validado.");
    if (isWeekendISO(dateISO)) {
      return bad(
        "Feriado no sábado ou domingo já usa o C1 de fim de semana. Não precisa validar."
      );
    }

    const validated = body.validated !== false;

    if (!validated) {
      await prisma.agendaHoliday.deleteMany({
        where: { team: session.team, dateISO },
      });
      return ok({ dateISO, name, validated: false });
    }

    const row = await prisma.agendaHoliday.upsert({
      where: { team_dateISO: { team: session.team, dateISO } },
      create: {
        team: session.team,
        dateISO,
        name,
        validatedById: session.id,
      },
      update: {
        name,
        validatedById: session.id,
        validatedAt: new Date(),
      },
    });

    return ok({ dateISO: row.dateISO, name: row.name, validated: true });
  } catch (e: any) {
    return bad(e?.message || "Erro interno.", 500);
  }
}
