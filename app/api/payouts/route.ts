import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // PENDING | PAID | CANCELED | null
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD
  const userId = searchParams.get("userId");

  const where: any = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;

  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }

  const rows = await prisma.employeePayout.findMany({
    where,
    orderBy: [{ date: "desc" }],
    include: { user: { select: { id: true, name: true, login: true } }, paidBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ rows });
}
