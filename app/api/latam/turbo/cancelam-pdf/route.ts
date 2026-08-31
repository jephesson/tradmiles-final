import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";
import { buildSimpleTextPdf } from "@/lib/pdf/simpleTextPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LATAM_CANCEL_AFTER_INACTIVE_DAYS = 10;

function startUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUTC(base: Date, days: number) {
  const d = startUTC(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysInMonthUTC(year: number, month0: number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function nextMonthOnDayUTC(base: Date, day: number) {
  const y0 = base.getUTCFullYear();
  const m0 = base.getUTCMonth();
  let y = y0;
  let m = m0 + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  const last = daysInMonthUTC(y, m);
  const dd = Math.min(Math.max(1, day), last);
  return new Date(Date.UTC(y, m, dd));
}

function monthKeyUTC(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKeyUTC(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec((key || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { y, m0: mm - 1 };
}

function startOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0, 1, 0, 0, 0, 0));
}

function endOfMonthUTCFromKey(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.m0 + 1, 0, 23, 59, 59, 999));
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function isBetweenUTC(d: Date, start: Date, end: Date) {
  const t = startUTC(d).getTime();
  return t >= startUTC(start).getTime() && t <= startUTC(end).getTime();
}

function computeCancelAt(subscribedAt: Date, renewalDay: number, lastRenewedAt: Date | null) {
  const day = clampInt(Number(renewalDay) || 1, 1, 31);
  const base = lastRenewedAt ?? subscribedAt;
  const nextRenewalAt = nextMonthOnDayUTC(base, day);
  const inactiveAt = addDaysUTC(nextRenewalAt, 1);
  return addDaysUTC(inactiveAt, LATAM_CANCEL_AFTER_INACTIVE_DAYS);
}

function dateBR(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d);
}

function monthLabel(key: string) {
  const p = parseMonthKeyUTC(key);
  if (!p) return key;
  return new Date(Date.UTC(p.y, p.m0, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function clubLabel(status: string) {
  if (status === "ACTIVE") return "Ativo";
  if (status === "PAUSED") return "Pausado";
  if (status === "CANCELED") return "Cancelado";
  return status || "-";
}

type PendingRow = {
  ownerId: string;
  ownerName: string;
  ownerLogin: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  clubStatus: string;
  cancelAt: Date;
};

export async function GET(req: NextRequest) {
  const session = await getSessionServer();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const monthKey = (req.nextUrl.searchParams.get("monthKey") || "").trim() || monthKeyUTC(new Date());
  const monthStart = startOfMonthUTCFromKey(monthKey);
  const monthEnd = endOfMonthUTCFromKey(monthKey);
  if (!monthStart || !monthEnd) {
    return NextResponse.json({ ok: false, error: "monthKey inválido (use YYYY-MM)." }, { status: 400 });
  }

  const cedentes = await prisma.cedente.findMany({
    where: { owner: { team: session.team } },
    select: {
      id: true,
      identificador: true,
      nomeCompleto: true,
      cpf: true,
      owner: { select: { id: true, name: true, login: true } },
    },
  });

  const cedenteIds = cedentes.map((c) => c.id);
  if (!cedenteIds.length) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma conta aguardando neste mês." },
      { status: 404 }
    );
  }

  const clubs = await prisma.clubSubscription.findMany({
    where: {
      team: session.team,
      program: "LATAM",
      cedenteId: { in: cedenteIds },
    },
    select: {
      cedenteId: true,
      status: true,
      subscribedAt: true,
      renewalDay: true,
      lastRenewedAt: true,
      createdAt: true,
    },
    orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
  });

  const latestClub = new Map<(typeof clubs)[number]["cedenteId"], (typeof clubs)[number]>();
  for (const c of clubs) {
    if (!latestClub.has(c.cedenteId)) latestClub.set(c.cedenteId, c);
  }

  const marks = await prisma.latamTurboMonth.findMany({
    where: { team: session.team, monthKey },
    select: { cedenteId: true, status: true },
  });
  const markByCedente = new Map(marks.map((m) => [m.cedenteId, m.status]));

  const pending: PendingRow[] = [];
  for (const ced of cedentes) {
    const club = latestClub.get(ced.id);
    if (!club || club.status === "CANCELED") continue;

    const cancelAt = computeCancelAt(club.subscribedAt, club.renewalDay, club.lastRenewedAt);
    if (!isBetweenUTC(cancelAt, monthStart, monthEnd)) continue;

    const turboStatus = markByCedente.get(ced.id) || "PENDING";
    if (turboStatus !== "PENDING") continue;

    pending.push({
      ownerId: ced.owner.id,
      ownerName: ced.owner.name || ced.owner.login,
      ownerLogin: ced.owner.login,
      identificador: ced.identificador,
      nomeCompleto: ced.nomeCompleto,
      cpf: ced.cpf,
      clubStatus: club.status,
      cancelAt,
    });
  }

  if (!pending.length) {
    return NextResponse.json(
      { ok: false, error: "Nenhuma conta aguardando em Cancelam no mês." },
      { status: 404 }
    );
  }

  const groups = new Map<string, { name: string; login: string; rows: PendingRow[] }>();
  for (const row of pending) {
    const cur = groups.get(row.ownerId);
    if (cur) {
      cur.rows.push(row);
    } else {
      groups.set(row.ownerId, {
        name: row.ownerName,
        login: row.ownerLogin,
        rows: [row],
      });
    }
  }

  const orderedGroups = [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
  for (const g of orderedGroups) {
    g.rows.sort((a, b) =>
      a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR", { sensitivity: "base" })
    );
  }

  const lines: string[] = [
    "TradeMiles — Turbo LATAM",
    `Cancelam no mes — somente aguardando`,
    `Mes: ${monthLabel(monthKey)}`,
    `Total: ${pending.length} conta(s) em ${orderedGroups.length} funcionario(s)`,
    "",
  ];

  for (const g of orderedGroups) {
    lines.push("================================================");
    lines.push(`FUNCIONARIO: ${g.name} (@${g.login})`);
    lines.push(`${g.rows.length} conta(s) aguardando`);
    lines.push("------------------------------------------------");
    for (const r of g.rows) {
      lines.push(`${r.identificador}  |  ${r.nomeCompleto}`);
      lines.push(
        `CPF ${r.cpf}  |  Clube ${clubLabel(r.clubStatus)}  |  Cancela em ${dateBR(r.cancelAt)}`
      );
      lines.push("");
    }
  }

  const pdf = buildSimpleTextPdf(lines);
  const fileName = `turbo-cancelam-aguardando-${monthKey}.pdf`;

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
