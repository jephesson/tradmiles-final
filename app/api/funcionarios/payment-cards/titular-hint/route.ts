import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function formatBirth(d: Date | null | undefined) {
  if (!d) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Sugestão de cobrança a partir do funcionário + cedente com o mesmo CPF
 * (funcionários costumam estar cadastrados também como cedentes).
 */
export async function GET(req: Request) {
  let session;
  try {
    session = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }

  const url = new URL(req.url);
  let userId = (url.searchParams.get("userId") || "").trim() || session.userId;
  if (userId !== session.userId && session.role !== "admin") {
    return bad("Sem permissão.", 403);
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, team: session.team },
    select: { id: true, name: true, cpf: true, email: true },
  });
  if (!user) return bad("Funcionário não encontrado.", 404);

  const cpf = (user.cpf || "").replace(/\D/g, "");

  let cedente =
    cpf.length === 11
      ? await prisma.cedente.findFirst({
          where: { cpf },
          select: {
            nomeCompleto: true,
            cpf: true,
            emailCriado: true,
            dataNascimento: true,
          },
        })
      : null;

  // Fallback: cedente próprio (owner) com CPF/nome do funcionário
  if (!cedente) {
    const owned = await prisma.cedente.findMany({
      where: { ownerId: user.id },
      select: {
        nomeCompleto: true,
        cpf: true,
        emailCriado: true,
        dataNascimento: true,
      },
      orderBy: { createdAt: "asc" },
      take: 30,
    });
    const nameNorm = user.name.trim().toLowerCase();
    cedente =
      owned.find((c) => c.nomeCompleto.trim().toLowerCase() === nameNorm) ||
      owned.find((c) =>
        c.nomeCompleto.toLowerCase().includes(nameNorm.split(/\s+/)[0] || "")
      ) ||
      null;
  }

  const birthDate = formatBirth(cedente?.dataNascimento);

  return NextResponse.json({
    ok: true,
    data: {
      holderName: (cedente?.nomeCompleto || user.name || "").trim() || null,
      cpf: cpf || cedente?.cpf || null,
      email: (user.email || cedente?.emailCriado || "").trim() || null,
      birthDate,
      source: {
        fromUser: Boolean(user.cpf || user.email),
        fromCedente: Boolean(cedente),
      },
    },
  });
}
