import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
};

/** Janela de cadastro do cedente considerada "conta nova". */
const CEDENTE_MAX_AGE_DAYS = 90;

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
  return readSessionCookie(store.get("tm.session")?.value);
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function iso(v: Date | null | undefined) {
  return v ? v.toISOString() : null;
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  const today = startOfToday();
  const cedenteSince = new Date(today);
  cedenteSince.setDate(cedenteSince.getDate() - CEDENTE_MAX_AGE_DAYS);

  const saleDb = prisma.sale as any;
  const rows = await saleDb.findMany({
    where: {
      program: "SMILES",
      locator: { not: null },
      NOT: [{ locator: "" }],
      cedente: { createdAt: { gte: cedenteSince } },
      AND: [
        {
          // Voo ainda não ocorreu: usa a volta quando existir, senão a ida.
          OR: [
            { returnDate: { gte: today } },
            { AND: [{ returnDate: null }, { departureDate: { gte: today } }] },
          ],
        },
        {
          OR: [
            { smilesLocatorManualStatus: null },
            { smilesLocatorManualStatus: { not: "DERRUBADO" } },
          ],
        },
      ],
    },
    select: {
      id: true,
      numero: true,
      date: true,
      locator: true,
      passengers: true,
      firstPassengerLastName: true,
      departureAirportIata: true,
      departureDate: true,
      returnDate: true,
      smilesLocatorManualStatus: true,
      smilesConfirmEmailSentAt: true,
      smilesConfirmEmailSentById: true,
      smilesConfirmPassengerNames: true,
      cedente: {
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          cpf: true,
          emailCriado: true,
          senhaEmail: true,
          createdAt: true,
        },
      },
    },
    take: 2000,
  });

  const senderIds = Array.from(
    new Set(
      rows
        .map((r: any) => String(r.smilesConfirmEmailSentById || "").trim())
        .filter((v: string) => Boolean(v))
    )
  ) as string[];

  const senders = senderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, name: true, login: true },
      })
    : [];

  const senderById = new Map(senders.map((u) => [u.id, u]));

  const mapped = rows.map((r: any) => ({
    id: r.id,
    numero: r.numero,
    date: iso(r.date),
    locator: r.locator || null,
    passengers: Number(r.passengers || 0),
    firstPassengerLastName: r.firstPassengerLastName || null,
    departureAirportIata: r.departureAirportIata || null,
    departureDate: iso(r.departureDate),
    returnDate: iso(r.returnDate),
    smilesLocatorManualStatus: r.smilesLocatorManualStatus || null,
    sentAt: iso(r.smilesConfirmEmailSentAt),
    sentBy: senderById.get(String(r.smilesConfirmEmailSentById || "")) || null,
    passengerNames: r.smilesConfirmPassengerNames || "",
    cedente: {
      id: r.cedente.id,
      identificador: r.cedente.identificador,
      nomeCompleto: r.cedente.nomeCompleto,
      cpf: r.cedente.cpf,
      email: r.cedente.emailCriado || null,
      senhaEmail: r.cedente.senhaEmail || null,
      createdAt: iso(r.cedente.createdAt),
    },
  }));

  // Voo mais próximo primeiro.
  mapped.sort((a: any, b: any) => {
    const ka = new Date(a.departureDate || a.returnDate || 0).getTime();
    const kb = new Date(b.departureDate || b.returnDate || 0).getTime();
    if (ka !== kb) return ka - kb;
    return String(a.cedente.nomeCompleto).localeCompare(
      String(b.cedente.nomeCompleto),
      "pt-BR"
    );
  });

  const summary = mapped.reduce(
    (acc: any, r: any) => {
      acc.total += 1;
      if (r.sentAt) acc.sent += 1;
      else acc.pending += 1;
      return acc;
    },
    { total: 0, sent: 0, pending: 0 }
  );

  return NextResponse.json({ ok: true, rows: mapped, summary });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.id) return bad("Não autenticado", 401);

  const body = await req.json().catch(() => ({}));
  const saleId = String(body?.saleId || "").trim();
  if (!saleId) return bad("saleId obrigatório.");

  const hasSent = typeof body?.sent === "boolean";
  const hasNames = typeof body?.passengerNames === "string";
  if (!hasSent && !hasNames) {
    return bad("Nada para atualizar.");
  }

  const saleDb = prisma.sale as any;
  const sale = await saleDb.findUnique({
    where: { id: saleId },
    select: { id: true, program: true },
  });

  if (!sale || sale.program !== "SMILES") {
    return bad("Venda SMILES não encontrada.", 404);
  }

  const data: Record<string, any> = {};

  if (hasSent) {
    const sent = Boolean(body.sent);
    data.smilesConfirmEmailSentAt = sent ? new Date() : null;
    data.smilesConfirmEmailSentById = sent ? session.id : null;
  }

  if (hasNames) {
    const names = String(body.passengerNames || "").trim();
    data.smilesConfirmPassengerNames = names || null;
  }

  const updated = await saleDb.update({
    where: { id: saleId },
    data,
    select: {
      id: true,
      smilesConfirmEmailSentAt: true,
      smilesConfirmEmailSentById: true,
      smilesConfirmPassengerNames: true,
    },
  });

  const sentById = String(updated.smilesConfirmEmailSentById || "").trim();
  const sentBy = sentById
    ? await prisma.user.findUnique({
        where: { id: sentById },
        select: { id: true, name: true, login: true },
      })
    : null;

  return NextResponse.json({
    ok: true,
    row: {
      id: updated.id,
      sentAt: iso(updated.smilesConfirmEmailSentAt),
      sentBy,
      passengerNames: updated.smilesConfirmPassengerNames || "",
    },
  });
}
