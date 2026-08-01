import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import { parsePassengerText } from "@/lib/latam/parsePassengerText";
import {
  getFillSession,
  setFillSession,
} from "@/lib/latam/fillSessionStore";
import { decryptPan } from "@/lib/payments/cardCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function formatBirthBr(d: Date | null | undefined) {
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const dd = parts.find((p) => p.type === "day")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const yyyy = parts.find((p) => p.type === "year")?.value;
  if (!dd || !mm || !yyyy) return null;
  return `${dd}/${mm}/${yyyy}`;
}

/** Se o cartão não tem nascimento, tenta pelo CPF no cadastro de cedente. */
async function enrichBirthDate(
  birthDate: string | null | undefined,
  cpf: string | null | undefined
) {
  if (birthDate && String(birthDate).replace(/\D/g, "").length >= 8) {
    return birthDate;
  }
  const digits = String(cpf || "").replace(/\D/g, "");
  if (digits.length !== 11) return birthDate || null;
  const cedente = await prisma.cedente.findFirst({
    where: { cpf: digits },
    select: { dataNascimento: true },
  });
  return formatBirthBr(cedente?.dataNascimento) || birthDate || null;
}

async function resolvePaymentCard(
  team: string,
  paymentCardId: string | null
) {
  if (!paymentCardId) return null;
  const row = await prisma.employeePaymentCard.findFirst({
    where: { id: paymentCardId, team },
  });
  if (!row) return null;

  const birthDate = await enrichBirthDate(row.birthDate, row.cpf);

  try {
    const pan = decryptPan(row.panCipher, row.panIv);
    return {
      id: row.id,
      label: row.label,
      holderName: row.holderName,
      brand: row.brand,
      last4: row.last4,
      expMonth: row.expMonth,
      expYear: row.expYear,
      pan,
      email: row.email,
      cpf: row.cpf,
      birthDate,
      zip: row.zip,
      street: row.street,
      number: row.number,
      complement: row.complement,
      district: row.district,
      city: row.city,
      state: row.state,
    };
  } catch {
    return {
      id: row.id,
      label: row.label,
      holderName: row.holderName,
      brand: row.brand,
      last4: row.last4,
      expMonth: row.expMonth,
      expYear: row.expYear,
      pan: null,
      error: "Não foi possível decifrar o cartão (CARD_ENCRYPTION_KEY?).",
      email: row.email,
      cpf: row.cpf,
      birthDate,
      zip: row.zip,
      street: row.street,
      number: row.number,
      complement: row.complement,
      district: row.district,
      city: row.city,
      state: row.state,
    };
  }
}

/** Extensão e o dashboard leem a sessão de preenchimento do funcionário logado. */
export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const row = await getFillSession(session.userId);
  const base = row || {
    useExtension: false,
    passengers: [],
    paymentCardId: null,
    saleHint: null,
  };

  const paymentCard =
    base.useExtension && base.paymentCardId
      ? await resolvePaymentCard(session.team, base.paymentCardId)
      : null;

  return NextResponse.json({
    ok: true,
    data: {
      ...base,
      paymentCard,
    },
  });
}

/** Dashboard grava se usa extensão + passageiros parseados (+ cartão escolhido). */
export async function PUT(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const body = await req.json().catch(() => ({}));
  const useExtension = Boolean(body?.useExtension);
  // null/"" = sem cartão (não forçar cartão padrão)
  const paymentCardId =
    body?.paymentCardId == null || body?.paymentCardId === ""
      ? null
      : String(body.paymentCardId);
  const saleHint = body?.saleHint ? String(body.saleHint) : null;

  let passengers = Array.isArray(body?.passengers) ? body.passengers : null;
  if (!passengers && typeof body?.passengerText === "string") {
    passengers = parsePassengerText(body.passengerText);
  }
  if (!passengers) {
    passengers = (await getFillSession(session.userId))?.passengers || [];
  }

  if (paymentCardId) {
    const card = await prisma.employeePaymentCard.findFirst({
      where: { id: paymentCardId, team: session.team },
    });
    if (!card) return bad("Cartão não encontrado.");
  }

  await setFillSession({
    userId: session.userId,
    team: session.team,
    useExtension,
    passengers,
    paymentCardId,
    saleHint,
  });

  return NextResponse.json({
    ok: true,
    data: await getFillSession(session.userId),
  });
}
