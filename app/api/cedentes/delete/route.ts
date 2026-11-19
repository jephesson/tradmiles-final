import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { readSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SessionCookie = {
  id: string;
  login: string;
  role: "admin" | "staff" | "socio" | "emissor";
  team: string;
};

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";").map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return null;
  return decodeURIComponent(hit.slice(name.length + 1));
}

async function requirePassword(req: Request, password: string) {
  const cookie = readCookie(req, "tm.session");
  if (!cookie) return { ok: false as const, status: 401, error: "Não autenticado." };

  const session = readSessionCookie(cookie) as SessionCookie | null;
  if (!session) {
    return { ok: false as const, status: 401, error: "Sessão inválida." };
  }

  if (!session?.id) return { ok: false as const, status: 401, error: "Sessão sem ID." };

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, passwordHash: true },
  });

  if (!user?.passwordHash) return { ok: false as const, status: 401, error: "Usuário não encontrado." };

  if (user.passwordHash !== sha256(password)) {
    return { ok: false as const, status: 401, error: "Senha inválida." };
  }

  return { ok: true as const, userId: user.id, team: session.team };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const ids = body?.ids;
    const password = String(body?.password ?? "").trim();

    if (!Array.isArray(ids) || !ids.length) {
      return NextResponse.json({ ok: false, error: "IDs ausentes." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ ok: false, error: "Senha ausente." }, { status: 400 });
    }

    const auth = await requirePassword(req, password);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const source = String(body?.source ?? "").trim().slice(0, 40) || "cadastro";
    const reason = String(body?.reason ?? "").trim().slice(0, 500) || null;

    // Guarda o rastro antes de apagar: quem era, telefone, quem indicou e quem excluiu.
    const toDelete = await prisma.cedente.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        telefone: true,
        status: true,
        createdAt: true,
        referredByCedenteId: true,
        referredByCedente: { select: { id: true, nomeCompleto: true, identificador: true } },
        referralAsReferred: {
          select: { referrerCedente: { select: { id: true, nomeCompleto: true, identificador: true } } },
        },
        owner: { select: { id: true, name: true, login: true, team: true } },
        invite: { select: { code: true, user: { select: { id: true, name: true } } } },
      },
    });

    const r = await prisma.$transaction(async (tx) => {
      for (const c of toDelete) {
        const referrer = c.referredByCedente || c.referralAsReferred?.referrerCedente || null;
        await tx.cedenteExclusion.create({
          data: {
            team: c.owner?.team || auth.team,
            cedenteId: c.id,
            cedenteIdentificador: c.identificador,
            cedenteNomeCompleto: c.nomeCompleto,
            cedenteCpf: c.cpf,
            scope: "ACCOUNT",
            program: null,
            deletedById: auth.userId,
            details: {
              mode: "CADASTRO_APAGADO",
              source,
              reasonText: reason || (source === "fila" ? "Cadastro excluído pela Fila de assinatura." : "Cadastro apagado."),
              historyPreserved: false,
              telefone: c.telefone,
              statusBefore: c.status,
              cadastradoEm: c.createdAt.toISOString(),
              referrerCedenteId: referrer?.id || null,
              referrerNome: referrer?.nomeCompleto || null,
              referrerIdentificador: referrer?.identificador || null,
              ownerName: c.owner?.name || c.owner?.login || null,
              inviteCode: c.invite?.code || null,
              inviteOwnerName: c.invite?.user?.name || null,
            },
          },
        });
      }
      return tx.cedente.deleteMany({ where: { id: { in: ids } } });
    });

    return NextResponse.json({ ok: true, deleted: r.count });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Erro ao apagar." }, { status: 500 });
  }
}
