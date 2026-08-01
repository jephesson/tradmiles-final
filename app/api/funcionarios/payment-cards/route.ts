import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import {
  encryptPan,
  panLast4,
} from "@/lib/payments/cardCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function publicCard(row: {
  id: string;
  userId: string | null;
  label: string;
  holderName: string;
  brand: string | null;
  last4: string;
  expMonth: number;
  expYear: number;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  isDefaultBoarding: boolean;
  isCompany: boolean;
}) {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    holderName: row.holderName,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.expMonth,
    expYear: row.expYear,
    zip: row.zip,
    street: row.street,
    number: row.number,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    isDefaultBoarding: row.isDefaultBoarding,
    isCompany: row.isCompany,
  };
}

export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const url = new URL(req.url);
  const userId = (url.searchParams.get("userId") || "").trim();
  const all = url.searchParams.get("all") === "1";
  const includeCompany = url.searchParams.get("company") !== "0";

  if (all && session.role !== "admin") {
    return bad("Só admin lista todos os cartões.", 403);
  }
  // Staff do mesmo time pode escolher cartão de outro funcionário na venda
  // (número completo só sai na sessão da extensão do usuário logado).

  const ownerFilter = all
    ? {}
    : userId
      ? { userId }
      : { userId: session.userId };

  const rows = await prisma.employeePaymentCard.findMany({
    where: {
      team: session.team,
      OR: [
        ownerFilter,
        ...(includeCompany && !all ? [{ isCompany: true as const }] : []),
        ...(all ? [{ isCompany: true as const }] : []),
      ],
    },
    orderBy: [{ isDefaultBoarding: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    ok: true,
    data: rows.map(publicCard),
  });
}

export async function POST(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const body = await req.json().catch(() => ({}));
  const isCompany = Boolean(body?.isCompany);
  if (isCompany && session.role !== "admin") {
    return bad("Só admin cadastra cartão da empresa.", 403);
  }

  const ownerId = isCompany
    ? null
    : String(body?.userId || session.userId).trim();

  if (!isCompany && ownerId !== session.userId && session.role !== "admin") {
    return bad("Sem permissão para cadastrar cartão de outro funcionário.", 403);
  }

  const pan = String(body?.pan || "").replace(/\D/g, "");
  const label = String(body?.label || (isCompany ? "Vias Aéreas" : "Cartão")).trim();
  const holderName = String(body?.holderName || "").trim();
  const expMonth = Number(body?.expMonth);
  const expYear = Number(body?.expYear);

  if (!holderName) return bad("Nome no cartão obrigatório.");
  if (!Number.isFinite(expMonth) || expMonth < 1 || expMonth > 12) {
    return bad("Mês de validade inválido.");
  }
  if (!Number.isFinite(expYear) || expYear < 2024) {
    return bad("Ano de validade inválido.");
  }

  let enc;
  try {
    enc = encryptPan(pan);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Falha ao cifrar cartão.");
  }

  const isDefaultBoarding = Boolean(body?.isDefaultBoarding);

  if (isDefaultBoarding && ownerId) {
    await prisma.employeePaymentCard.updateMany({
      where: { team: session.team, userId: ownerId },
      data: { isDefaultBoarding: false },
    });
  }

  const created = await prisma.employeePaymentCard.create({
    data: {
      team: session.team,
      userId: ownerId,
      label,
      holderName,
      brand: body?.brand ? String(body.brand) : null,
      last4: panLast4(pan),
      expMonth,
      expYear,
      panCipher: enc.panCipher,
      panIv: enc.panIv,
      zip: body?.zip ? String(body.zip) : null,
      street: body?.street ? String(body.street) : null,
      number: body?.number ? String(body.number) : null,
      complement: body?.complement ? String(body.complement) : null,
      district: body?.district ? String(body.district) : null,
      city: body?.city ? String(body.city) : null,
      state: body?.state ? String(body.state) : null,
      isDefaultBoarding,
      isCompany,
    },
  });

  return NextResponse.json({ ok: true, data: publicCard(created) });
}

export async function DELETE(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id) return bad("id obrigatório.");

  const row = await prisma.employeePaymentCard.findFirst({
    where: { id, team: session.team },
  });
  if (!row) return bad("Cartão não encontrado.", 404);

  if (row.isCompany && session.role !== "admin") {
    return bad("Só admin remove cartão da empresa.", 403);
  }
  if (
    !row.isCompany &&
    row.userId !== session.userId &&
    session.role !== "admin"
  ) {
    return bad("Sem permissão.", 403);
  }

  await prisma.employeePaymentCard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
