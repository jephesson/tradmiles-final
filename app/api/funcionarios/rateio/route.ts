import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = { id: string; login: string; team: string; role: "admin" | "staff" };

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function safeInt(v: any, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
}

function toBps(percent: any) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return 0;
  return Math.round(p * 100); // 2 casas -> bps
}

type PutBody = {
  ownerId?: string;
  items?: Array<{
    payeeId?: string;
    percent?: number | string;
  }>;
};

type RateioItemNorm = { payeeId: string; bps: number };

export async function GET() {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { team: session.team },
    orderBy: { name: "asc" },
    select: { id: true, name: true, login: true, role: true },
  });

  const cedCounts = await prisma.cedente.groupBy({
    by: ["ownerId"],
    where: { owner: { team: session.team } },
    _count: { _all: true },
  });

  const cedCountMap = new Map<string, number>();
  for (const g of cedCounts) cedCountMap.set(String(g.ownerId), safeInt(g._count._all, 0));

  const shares = await prisma.profitShare.findMany({
    where: { team: session.team, isActive: true },
    select: {
      ownerId: true,
      items: {
        orderBy: { bps: "desc" },
        select: {
          payeeId: true,
          bps: true,
          payee: { select: { id: true, name: true, login: true } },
        },
      },
    },
  });

  const shareMap = new Map<
    string,
    { payeeId: string; bps: number; payee: { id: string; name: string; login: string } }[]
  >();
  for (const s of shares) {
    shareMap.set(
      String(s.ownerId),
      s.items.map((it) => ({ payeeId: it.payeeId, bps: it.bps, payee: it.payee }))
    );
  }

  const rows = users.map((u) => {
    const items = shareMap.get(u.id) || [
      { payeeId: u.id, bps: 10000, payee: { id: u.id, name: u.name, login: u.login } },
    ];

    const sumBps = items.reduce((acc, it) => acc + safeInt(it.bps, 0), 0);

    return {
      owner: { id: u.id, name: u.name, login: u.login, role: u.role },
      cedentesCount: cedCountMap.get(u.id) || 0,
      items,
      sumBps,
      isDefault: !shareMap.has(u.id),
    };
  });

  return NextResponse.json({ ok: true, users, rows });
}

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as PutBody;

  const ownerId = String(body.ownerId || "").trim();
  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "ownerId obrigatório" }, { status: 400 });
  }

  const owner = await prisma.user.findFirst({
    where: { id: ownerId, team: session.team },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Owner inválido" }, { status: 400 });
  }

  // normaliza itens (percent -> bps)
  const items: RateioItemNorm[] = itemsRaw
    .map((it): RateioItemNorm => ({
      payeeId: String(it?.payeeId || "").trim(),
      bps: toBps(it?.percent),
    }))
    .filter((it) => it.payeeId.length > 0 && it.bps >= 0);

  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "Informe pelo menos 1 destinatário" }, { status: 400 });
  }

  // valida duplicados
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.payeeId)) {
      return NextResponse.json({ ok: false, error: "Destinatário repetido no rateio" }, { status: 400 });
    }
    seen.add(it.payeeId);
  }

  // valida payees no mesmo team
  const payeeIds = items.map((x) => x.payeeId);
  const payees = await prisma.user.findMany({
    where: { id: { in: payeeIds }, team: session.team },
    select: { id: true },
  });
  if (payees.length !== payeeIds.length) {
    return NextResponse.json({ ok: false, error: "Um ou mais destinatários não pertencem ao team" }, { status: 400 });
  }

  const sumBps = items.reduce((acc, it) => acc + safeInt(it.bps, 0), 0);
  if (sumBps !== 10000) {
    return NextResponse.json({ ok: false, error: "O rateio precisa somar 100%" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.profitShare.upsert({
      where: { team_ownerId: { team: session.team, ownerId } },
      create: {
        team: session.team,
        ownerId,
        isActive: true,
        items: {
          create: items.map((it) => ({
            payeeId: it.payeeId,
            bps: it.bps,
          })),
        },
      },
      update: {
        isActive: true,
        items: {
          deleteMany: {},
          create: items.map((it) => ({
            payeeId: it.payeeId,
            bps: it.bps,
          })),
        },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
