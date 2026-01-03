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
  return Math.round(p * 100); // 2 casas -> bps (100.00% => 10000)
}

/** "YYYY-MM-DD" -> Date local (00:00) */
function parseDateISOToLocalDay(v: any): Date | null {
  const s = String(v || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mm - 1, d, 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

type OutItem = {
  payeeId: string;
  bps: number;
  payee: { id: string; name: string; login: string };
};

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const atParam = url.searchParams.get("at"); // opcional: simular "vigência em X data"
  const at = atParam ? parseDateISOToLocalDay(atParam) : null;
  const now = at ?? new Date();

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

  /**
   * ✅ pega o rateio vigente em `now` por owner:
   * effectiveFrom <= now AND (effectiveTo is null OR effectiveTo > now)
   * e usa distinct(ownerId) com orderBy effectiveFrom desc
   */
  const shares = await prisma.profitShare.findMany({
    where: {
      team: session.team,
      isActive: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: [{ ownerId: "asc" }, { effectiveFrom: "desc" }],
    distinct: ["ownerId"],
    select: {
      ownerId: true,
      effectiveFrom: true,
      effectiveTo: true,
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

  const shareMap = new Map<string, { effectiveFrom: string; effectiveTo: string | null; items: OutItem[] }>();
  for (const s of shares) {
    shareMap.set(String(s.ownerId), {
      effectiveFrom: s.effectiveFrom.toISOString(),
      effectiveTo: s.effectiveTo ? s.effectiveTo.toISOString() : null,
      items: s.items.map((it) => ({ payeeId: it.payeeId, bps: it.bps, payee: it.payee })),
    });
  }

  const rows = users.map((u) => {
    const found = shareMap.get(u.id);

    const items: OutItem[] =
      found?.items?.length
        ? found.items
        : [{ payeeId: u.id, bps: 10000, payee: { id: u.id, name: u.name, login: u.login } }];

    const sumBps = items.reduce((acc, it) => acc + safeInt(it.bps, 0), 0);

    return {
      owner: { id: u.id, name: u.name, login: u.login, role: u.role },
      cedentesCount: cedCountMap.get(u.id) || 0,
      items,
      sumBps,
      isDefault: !found,
      effectiveFrom: found?.effectiveFrom ?? null,
      effectiveTo: found?.effectiveTo ?? null,
    };
  });

  return NextResponse.json({ ok: true, users, rows, at: now.toISOString() });
}

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const ownerId = String(body.ownerId || "").trim();
  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  // ✅ NOVO: vigência
  const effectiveFromRaw = body.effectiveFrom;
  const effectiveFrom = parseDateISOToLocalDay(effectiveFromRaw);

  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "ownerId obrigatório" }, { status: 400 });
  }
  if (!effectiveFrom) {
    return NextResponse.json({ ok: false, error: "effectiveFrom inválido (use YYYY-MM-DD)" }, { status: 400 });
  }

  const owner = await prisma.user.findFirst({
    where: { id: ownerId, team: session.team },
    select: { id: true },
  });
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Owner inválido" }, { status: 400 });
  }

  // ✅ tipagem pra não cair em implicit any
  const items: Array<{ payeeId: string; bps: number }> = itemsRaw
    .map((it: any) => ({
      payeeId: String(it?.payeeId || "").trim(),
      bps: toBps(it?.percent),
    }))
    .filter((it) => it.payeeId && it.bps >= 0);

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
  const payeeIds: string[] = items.map((it) => it.payeeId);
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
    // acha o "próximo" já agendado (pra setar effectiveTo do novo)
    const next = await tx.profitShare.findFirst({
      where: { team: session.team, ownerId, effectiveFrom: { gt: effectiveFrom } },
      orderBy: { effectiveFrom: "asc" },
      select: { id: true, effectiveFrom: true },
    });

    // acha o "anterior" (pra fechar com effectiveTo = effectiveFrom do novo)
    const prev = await tx.profitShare.findFirst({
      where: { team: session.team, ownerId, effectiveFrom: { lt: effectiveFrom } },
      orderBy: { effectiveFrom: "desc" },
      select: { id: true, effectiveFrom: true, effectiveTo: true },
    });

    // cria/atualiza o rateio desta data
    const plan = await tx.profitShare.upsert({
      where: {
        team_ownerId_effectiveFrom: {
          team: session.team,
          ownerId,
          effectiveFrom,
        },
      },
      create: {
        team: session.team,
        ownerId,
        isActive: true,
        effectiveFrom,
        effectiveTo: next?.effectiveFrom ?? null,
        items: {
          create: items.map((it) => ({
            payeeId: it.payeeId,
            bps: it.bps,
          })),
        },
      },
      update: {
        isActive: true,
        effectiveTo: next?.effectiveFrom ?? null,
        items: {
          deleteMany: {},
          create: items.map((it) => ({
            payeeId: it.payeeId,
            bps: it.bps,
          })),
        },
      },
      select: { id: true, effectiveFrom: true },
    });

    // fecha o anterior (se existir e se fizer sentido)
    if (prev?.id) {
      const prevTo = prev.effectiveTo ? new Date(prev.effectiveTo) : null;
      if (!prevTo || prevTo > effectiveFrom) {
        await tx.profitShare.update({
          where: { id: prev.id },
          data: { effectiveTo: effectiveFrom },
        });
      }
    }

    // garantia: se existir next, o plan já ficou com effectiveTo=next.effectiveFrom
    // (se não existir next, effectiveTo = null = vigente até mudar)
    void plan;
  });

  return NextResponse.json({ ok: true });
}
