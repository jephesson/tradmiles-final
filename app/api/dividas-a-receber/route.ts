import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { todayISORecife } from "@/lib/payouts/autoCompute";
import { applyEmployeeDebtDiscountsRange } from "@/lib/payouts/applyEmployeeDebtDiscounts";

const TEAM_ROLES = ["admin", "staff"] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeInt(v: unknown, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}
function normalizeText(v: unknown, max = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}
function parseDate(v: unknown): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

type ReceberStatus = "OPEN" | "PARTIAL" | "PAID" | "CANCELED";
type ReceberCategoria =
  | "EMPRESTIMO"
  | "CARTAO"
  | "PARCELAMENTO"
  | "SERVICO"
  | "OUTROS";
type ReceberMetodo =
  | "PIX"
  | "CARTAO"
  | "BOLETO"
  | "DINHEIRO"
  | "TRANSFERENCIA"
  | "OUTRO";

const STATUS: ReceberStatus[] = ["OPEN", "PARTIAL", "PAID", "CANCELED"];
const CATEG: ReceberCategoria[] = [
  "EMPRESTIMO",
  "CARTAO",
  "PARCELAMENTO",
  "SERVICO",
  "OUTROS",
];
const METOD: ReceberMetodo[] = [
  "PIX",
  "CARTAO",
  "BOLETO",
  "DINHEIRO",
  "TRANSFERENCIA",
  "OUTRO",
];

export function computeStatus(
  totalCents: number,
  receivedCents: number
): ReceberStatus {
  if (totalCents <= 0) return "OPEN";
  if (receivedCents <= 0) return "OPEN";
  if (receivedCents >= totalCents) return "PAID";
  return "PARTIAL";
}

function buildWhere(
  sessionTeam: string,
  statusRaw: string,
  q: string,
  kind: "GERAL" | "FUNCIONARIO",
  employeeUserId?: string | null
) {
  const where: Record<string, unknown> = { team: sessionTeam, kind };

  if (kind === "FUNCIONARIO" && employeeUserId) {
    where.employeeUserId = employeeUserId;
  }

  const status = (statusRaw || "").toUpperCase();
  if (status && STATUS.includes(status as ReceberStatus)) {
    where.status = status;
  }

  if (q) {
    where.OR = [
      { debtorName: { contains: q, mode: "insensitive" } },
      { debtorDoc: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
      { sourceLabel: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

function summarizeFromAggregate(sumTotal: number, sumReceived: number) {
  const totalCents = safeInt(sumTotal, 0);
  const receivedCents = safeInt(sumReceived, 0);
  // saldo global (agregado). assume que no geral received <= total.
  const balanceCents = Math.max(0, totalCents - receivedCents);
  return { totalCents, receivedCents, balanceCents };
}

export async function GET(req: Request) {
  const session = await requireSession();

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "").toUpperCase();
  const q = (url.searchParams.get("q") || "").trim();
  const take = Math.min(Math.max(safeInt(url.searchParams.get("take"), 100), 1), 300);

  const kindRaw = String(url.searchParams.get("kind") || "GERAL").toUpperCase();
  const kind = kindRaw === "FUNCIONARIO" ? ("FUNCIONARIO" as const) : ("GERAL" as const);

  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true },
  });
  const isAdmin = String(dbUser?.role || session.role).trim().toLowerCase() === "admin";

  if (kind === "FUNCIONARIO") {
    const catchUpWhere: Record<string, unknown> = {
      team: session.team,
      kind: "FUNCIONARIO",
      status: { in: ["OPEN", "PARTIAL"] },
    };
    if (!isAdmin) catchUpWhere.employeeUserId = session.id;

    const catchUpDebts = await prisma.dividaAReceber.findMany({
      where: catchUpWhere,
      select: { startsOn: true, createdAt: true },
    });
    const starts = catchUpDebts
      .map((d) => d.startsOn || d.createdAt.toISOString().slice(0, 10))
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
      .sort();
    if (starts[0]) {
      await applyEmployeeDebtDiscountsRange(session.team, starts[0], todayISORecife());
    }
  }

  const where = buildWhere(
    session.team,
    status,
    q,
    kind,
    kind === "FUNCIONARIO" && !isAdmin ? session.id : null
  );

  const [rows, employees] = await Promise.all([
    prisma.dividaAReceber.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take,
      include: {
        payments: { orderBy: { receivedAt: "desc" } },
        owner: { select: { id: true, name: true, login: true } },
        employeeUser: { select: { id: true, name: true, login: true } },
        dayCharges: { orderBy: { date: "desc" }, take: 40 },
      },
    }),
    kind === "FUNCIONARIO"
      ? prisma.user.findMany({
          where: {
            team: session.team,
            role: { in: [...TEAM_ROLES] },
            ...(isAdmin ? {} : { id: session.id }),
          },
          select: { id: true, name: true, login: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as { id: string; name: string; login: string }[]),
  ]);

  // ✅ totais ALL (independente de take)
  const aggAll = await prisma.dividaAReceber.aggregate({
    where,
    _sum: { totalCents: true, receivedCents: true },
  });

  // ✅ totais OPEN+PARTIAL (independente de take)
  const whereOpen = {
    ...where,
    status: { in: ["OPEN", "PARTIAL"] as ReceberStatus[] },
  };

  const aggOpen = await prisma.dividaAReceber.aggregate({
    where: whereOpen,
    _sum: { totalCents: true, receivedCents: true },
  });

  const totalsAll = summarizeFromAggregate(
    aggAll._sum.totalCents ?? 0,
    aggAll._sum.receivedCents ?? 0
  );

  const totalsOpen = summarizeFromAggregate(
    aggOpen._sum.totalCents ?? 0,
    aggOpen._sum.receivedCents ?? 0
  );

  return NextResponse.json({
    ok: true,
    rows,
    totalsAll,
    totalsOpen,
    employees,
    viewer: { id: session.id, role: isAdmin ? "admin" : "staff" },
  });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));

  const kindRaw = String(body.kind || "GERAL").toUpperCase();
  const kind = kindRaw === "FUNCIONARIO" ? ("FUNCIONARIO" as const) : ("GERAL" as const);

  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: { role: true },
  });
  const isAdmin = String(dbUser?.role || session.role).trim().toLowerCase() === "admin";

  let employeeUserId: string | null = null;
  let debtorName = normalizeText(body.debtorName, 120);

  if (kind === "FUNCIONARIO") {
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Somente o administrador controla a dívida do funcionário." },
        { status: 403 }
      );
    }
    const requestedId = String(body.employeeUserId || "").trim();

    if (!requestedId) {
      return NextResponse.json(
        { ok: false, error: "Selecione o funcionário." },
        { status: 400 }
      );
    }

    const target = await prisma.user.findFirst({
      where: {
        id: requestedId,
        team: session.team,
        role: { in: [...TEAM_ROLES] },
      },
      select: { id: true, name: true, login: true },
    });
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Selecione um funcionário válido." },
        { status: 400 }
      );
    }
    employeeUserId = target.id;
    debtorName = normalizeText(target.name || target.login, 120);
  }

  const title = normalizeText(body.title, 160);
  const totalCents = safeInt(body.totalCents, 0);

  if (!debtorName)
    return NextResponse.json(
      { ok: false, error: "Informe o nome de quem te deve." },
      { status: 400 }
    );
  if (!title)
    return NextResponse.json(
      { ok: false, error: "Informe um título." },
      { status: 400 }
    );
  if (totalCents <= 0)
    return NextResponse.json(
      { ok: false, error: "Total precisa ser maior que 0." },
      { status: 400 }
    );

  const categoryRaw = String(body.category || "OUTROS").toUpperCase();
  const methodRaw = String(body.method || "PIX").toUpperCase();

  const categoryFinal: ReceberCategoria = CATEG.includes(categoryRaw as ReceberCategoria)
    ? (categoryRaw as ReceberCategoria)
    : "OUTROS";

  const methodFinal: ReceberMetodo = METOD.includes(methodRaw as ReceberMetodo)
    ? (methodRaw as ReceberMetodo)
    : "PIX";

  const startsOnRaw = String(body.startsOn || "").slice(0, 10);
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(startsOnRaw) ? startsOnRaw : todayISORecife();
  const percent = Number(String(body.dailyProfitPercent ?? "").replace(",", "."));
  const dailyProfitBps =
    kind === "FUNCIONARIO"
      ? Math.min(10000, Math.max(0, Math.round((Number.isFinite(percent) ? percent : 0) * 100)))
      : 0;

  if (kind === "FUNCIONARIO" && dailyProfitBps <= 0) {
    return NextResponse.json(
      { ok: false, error: "Informe o percentual do lucro diário." },
      { status: 400 }
    );
  }

  const dueDate = parseDate(body.dueDate);

  const created = await prisma.dividaAReceber.create({
    data: {
      ownerId: session.id,
      team: session.team,

      debtorName,
      debtorDoc: normalizeText(body.debtorDoc, 40) || null,
      debtorPhone: normalizeText(body.debtorPhone, 40) || null,
      debtorEmail: normalizeText(body.debtorEmail, 160) || null,

      title,
      description: normalizeText(body.description, 2000) || null,

      category: categoryFinal,
      method: methodFinal,

      totalCents,
      receivedCents: 0,
      dueDate,
      status: "OPEN",

      sourceLabel: normalizeText(body.sourceLabel, 120) || null,

      kind,
      employeeUserId,
      dailyProfitBps,
      startsOn: kind === "FUNCIONARIO" ? startsOn : null,
    },
  });

  if (kind === "FUNCIONARIO") {
    await applyEmployeeDebtDiscountsRange(session.team, startsOn, todayISORecife());
  }

  return NextResponse.json({ ok: true, row: created });
}
