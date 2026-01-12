import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";

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
type ReceberCategoria = "EMPRESTIMO" | "CARTAO" | "PARCELAMENTO" | "SERVICO" | "OUTROS";
type ReceberMetodo = "PIX" | "CARTAO" | "BOLETO" | "DINHEIRO" | "TRANSFERENCIA" | "OUTRO";

export function computeStatus(totalCents: number, receivedCents: number): ReceberStatus {
  if (totalCents <= 0) return "OPEN";
  if (receivedCents <= 0) return "OPEN";
  if (receivedCents >= totalCents) return "PAID";
  return "PARTIAL";
}

export async function GET(req: Request) {
  const session = await requireSession();

  const url = new URL(req.url);
  const status = (url.searchParams.get("status") || "").toUpperCase();
  const q = (url.searchParams.get("q") || "").trim();
  const take = Math.min(Math.max(safeInt(url.searchParams.get("take"), 100), 1), 300);

  const where: any = { team: session.team };

  if (status && ["OPEN", "PARTIAL", "PAID", "CANCELED"].includes(status)) {
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

  const rows = await prisma.dividaAReceber.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take,
    include: {
      payments: { orderBy: { receivedAt: "desc" } },
      owner: { select: { id: true, name: true, login: true } },
    },
  });

  const totals = rows.reduce(
    (acc, r) => {
      const total = r.totalCents || 0;
      const rec = r.receivedCents || 0;
      acc.totalCents += total;
      acc.receivedCents += rec;
      acc.balanceCents += Math.max(0, total - rec);
      return acc;
    },
    { totalCents: 0, receivedCents: 0, balanceCents: 0 }
  );

  return NextResponse.json({ ok: true, rows, totals });
}

export async function POST(req: Request) {
  const session = await requireSession();
  const body = await req.json().catch(() => ({}));

  const debtorName = normalizeText(body.debtorName, 120);
  const title = normalizeText(body.title, 160);
  const totalCents = safeInt(body.totalCents, 0);

  if (!debtorName) return NextResponse.json({ ok: false, error: "Informe o nome de quem te deve." }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "Informe um título." }, { status: 400 });
  if (totalCents <= 0) return NextResponse.json({ ok: false, error: "Total precisa ser maior que 0." }, { status: 400 });

  const category = String(body.category || "OUTROS").toUpperCase() as ReceberCategoria;
  const method = String(body.method || "PIX").toUpperCase() as ReceberMetodo;

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

      category: ["EMPRESTIMO", "CARTAO", "PARCELAMENTO", "SERVICO", "OUTROS"].includes(category)
        ? category
        : "OUTROS",
      method: ["PIX", "CARTAO", "BOLETO", "DINHEIRO", "TRANSFERENCIA", "OUTRO"].includes(method)
        ? method
        : "PIX",

      totalCents,
      receivedCents: 0,
      dueDate,
      status: "OPEN",

      sourceLabel: normalizeText(body.sourceLabel, 120) || null,
    },
  });

  return NextResponse.json({ ok: true, row: created });
}
