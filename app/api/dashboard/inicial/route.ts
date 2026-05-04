import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONLINE_WINDOW_MS = 3 * 60 * 1000;

function noCache() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function todayRecifeISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nowMinutesRecife(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}

function fmtMin(min: number) {
  const hh = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${hh}:${m}`;
}

function isoToLongLabel(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/** Ponto no tempo está em [start, end) ? */
function inHalfOpenRange(t: number, start: number, end: number) {
  return t >= start && t < end;
}

export async function GET() {
  try {
    const session = await requireSession();
    const todayISO = todayRecifeISO();
    const nowMin = nowMinutesRecife();

    const [events, users] = await Promise.all([
      prisma.agendaEvent.findMany({
        where: {
          team: session.team,
          status: "ACTIVE",
          dateISO: todayISO,
        },
        include: {
          user: { select: { id: true, name: true, login: true } },
        },
        orderBy: [{ startMin: "asc" }, { userId: "asc" }],
      }),
      prisma.user.findMany({
        where: { team: session.team },
        select: { id: true, name: true, login: true, lastPresenceAt: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const now = Date.now();

    const agendaToday = events.map((e) => ({
      id: e.id,
      type: e.type as "SHIFT" | "ABSENCE",
      startHHMM: fmtMin(e.startMin),
      endHHMM: fmtMin(e.endMin),
      startMin: e.startMin,
      endMin: e.endMin,
      note: e.note || "",
      user: e.user,
    }));

    const byUser = new Map<string, typeof agendaToday>();
    for (const row of agendaToday) {
      const uid = row.user.id;
      const arr = byUser.get(uid) || [];
      arr.push(row);
      byUser.set(uid, arr);
    }

    const expectedOnline: Array<{
      id: string;
      name: string;
      login: string;
      shiftLabel: string;
    }> = [];

    for (const u of users) {
      const list = byUser.get(u.id) || [];
      const absentNow = list.some(
        (e) => e.type === "ABSENCE" && inHalfOpenRange(nowMin, e.startMin, e.endMin)
      );
      if (absentNow) continue;

      const shiftNow = list.find(
        (e) => e.type === "SHIFT" && inHalfOpenRange(nowMin, e.startMin, e.endMin)
      );
      if (shiftNow) {
        expectedOnline.push({
          id: u.id,
          name: u.name,
          login: u.login,
          shiftLabel: `${shiftNow.startHHMM}–${shiftNow.endHHMM}`,
        });
      }
    }

    expectedOnline.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const teamPresence = users.map((u) => {
      const t = u.lastPresenceAt ? new Date(u.lastPresenceAt).getTime() : 0;
      const online = t > 0 && now - t <= ONLINE_WINDOW_MS;
      return {
        id: u.id,
        name: u.name,
        login: u.login,
        online,
        lastPresenceAt: u.lastPresenceAt ? u.lastPresenceAt.toISOString() : null,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          todayISO,
          todayLabel: isoToLongLabel(todayISO),
          nowHHMM: fmtMin(nowMin),
          agendaToday,
          expectedOnline,
          teamPresence,
        },
      },
      { headers: noCache() }
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401, headers: noCache() });
    }
    return NextResponse.json(
      { ok: false, error: msg || "Erro ao carregar página inicial." },
      { status: 500, headers: noCache() }
    );
  }
}
