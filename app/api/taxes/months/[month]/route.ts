import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isValidMonthKey, monthIsPayable, monthKeyTZ } from "@/lib/taxes";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ month: string }> };

type AggRow = { userid: string; amount: bigint | number | null };

const USER_KEY_CANDIDATES = ["userId", "payeeId", "employeeId"] as const;

function msg(err: unknown) {
  return (err as any)?.message || "";
}
function isUnknownFieldOrArg(err: unknown) {
  const m = msg(err);
  return (
    typeof m === "string" &&
    (m.includes("Unknown arg") ||
      m.includes("Unknown field") ||
      m.includes("Unknown argument"))
  );
}

let cachedUserKey: (typeof USER_KEY_CANDIDATES)[number] | null = null;

async function detectUserKey() {
  if (cachedUserKey) return cachedUserKey;

  // tenta descobrir qual campo existe no TaxMonthPayment
  for (const key of USER_KEY_CANDIDATES) {
    try {
      // se o campo existir, isso NÃO quebra (mesmo com tabela vazia)
      await prisma.taxMonthPayment.findFirst({
        select: { [key]: true } as any,
      } as any);

      cachedUserKey = key;
      return key;
    } catch (e) {
      if (isUnknownFieldOrArg(e)) continue;
      throw e;
    }
  }

  throw new Error(
    "TaxMonthPayment não possui campo de usuário (userId/payeeId/employeeId). Ajuste o schema."
  );
}

async function syncMonth(team: string, month: string) {
  const userKey = await detectUserKey();

  const rows = await prisma.$queryRaw<AggRow[]>`
    SELECT
      "userId"         AS userid,
      SUM("tax7Cents") AS amount
    FROM employee_payouts
    WHERE team = ${team}
      AND date LIKE ${month + "-%"}
    GROUP BY "userId"
  `;

  await Promise.all(
    rows.map(async (r) => {
      const userId = String(r.userid);
      const amountCents =
        typeof r.amount === "bigint" ? Number(r.amount) : Number(r.amount || 0);

      const where = { team, month, [userKey]: userId } as any;

      // ✅ SEM findUnique (evita team_month_userId)
      const existing = await prisma.taxMonthPayment.findFirst({
        where,
        select: { id: true, status: true } as any,
      } as any);

      if (!existing) {
        await prisma.taxMonthPayment.create({
          data: {
            team,
            month,
            [userKey]: userId,
            amountCents,
          } as any,
        });
        return;
      }

      // não altera valor se já estiver PAID (pra não mudar histórico do pago)
      if (existing.status !== "PAID") {
        await prisma.taxMonthPayment.update({
          where: { id: existing.id } as any,
          data: { amountCents } as any,
        } as any);
      }
    })
  );
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = getSession();
  if (!session?.team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = session.team;
  const { month } = await ctx.params;

  if (!isValidMonthKey(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  const currentMonth = monthKeyTZ();
  const payable = monthIsPayable(month, currentMonth);

  await syncMonth(team, month);

  const userKey = await detectUserKey();

  const items = await prisma.taxMonthPayment.findMany({
    where: { team, month, amountCents: { gt: 0 } } as any,
    orderBy: [{ status: "asc" }, { amountCents: "desc" }] as any,
  } as any);

  const userIds = Array.from(
    new Set(
      (items as any[])
        .map((i) => i?.[userKey])
        .filter((v) => typeof v === "string" && v.length > 0)
    )
  );

  const paidByIds = Array.from(
    new Set(
      (items as any[])
        .map((i) => i?.paidById)
        .filter((v) => typeof v === "string" && v.length > 0)
    )
  );

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, login: true },
  });

  const paidBys = await prisma.user.findMany({
    where: { id: { in: paidByIds } },
    select: { id: true, name: true, login: true },
  });

  const usersMap = new Map(users.map((u) => [u.id, u]));
  const paidByMap = new Map(paidBys.map((u) => [u.id, u]));

  const totalCents = (items as any[]).reduce(
    (a, b) => a + Number(b?.amountCents || 0),
    0
  );

  const paidCents = (items as any[])
    .filter((i) => i?.status === "PAID")
    .reduce((a, b) => a + Number(b?.amountCents || 0), 0);

  return NextResponse.json({
    month,
    currentMonth,
    payable,
    totalCents,
    paidCents,
    pendingCents: Math.max(0, totalCents - paidCents),
    items: (items as any[]).map((i) => {
      const uid = i?.[userKey] as string | undefined;
      const u = uid ? usersMap.get(uid) : null;

      const pbid = i?.paidById as string | undefined;
      const pb = pbid ? paidByMap.get(pbid) : null;

      return {
        id: i.id,
        userId: uid || null,
        userName: u?.name || null,
        userLogin: u?.login || null,

        amountCents: Number(i.amountCents || 0),
        status: i.status,

        paidAt: i.paidAt || null,
        paidByName: pb?.name || null,
        note: i.note || null,
      };
    }),
  });
}
