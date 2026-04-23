import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_STATUS,
  DEFAULT_AFFILIATE_TEAM,
  onlyDigits,
  slugifyAffiliateName,
} from "@/lib/affiliates/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function noCacheHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

async function makeUniqueLogin(name: string, document: string) {
  const base = slugifyAffiliateName(name);
  const suffix = document.slice(-4);

  for (let i = 0; i < 50; i += 1) {
    const candidate =
      i === 0 ? base : i === 1 ? `${base}-${suffix}` : `${base}-${suffix}-${i}`;
    const existing = await prisma.affiliate.findFirst({
      where: { login: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return `${base}-${suffix}-${Date.now().toString(36)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const document = onlyDigits(body.cpf ?? body.document);
    const pixKey = String(body.pixKey ?? body.pix ?? "").trim();
    const password = String(body.password ?? "");

    if (name.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Informe seu nome completo." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (document.length !== 11) {
      return NextResponse.json(
        { ok: false, error: "Informe um CPF válido." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (!pixKey) {
      return NextResponse.json(
        { ok: false, error: "Informe sua chave Pix." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { ok: false, error: "Senha deve ter pelo menos 4 caracteres." },
        { status: 400, headers: noCacheHeaders() }
      );
    }

    const duplicate = await prisma.affiliate.findFirst({
      where: { team: DEFAULT_AFFILIATE_TEAM, document },
      select: { id: true, status: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { ok: false, error: "Já existe um cadastro de afiliado com este CPF." },
        { status: 409, headers: noCacheHeaders() }
      );
    }

    const login = await makeUniqueLogin(name, document);

    const affiliate = await prisma.affiliate.create({
      data: {
        team: DEFAULT_AFFILIATE_TEAM,
        name,
        document,
        pixKey,
        login,
        passwordHash: sha256(password),
        status: AFFILIATE_STATUS.PENDING,
        isActive: false,
        commissionBps: 0,
      },
      select: {
        id: true,
        name: true,
        login: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: { affiliate },
        message: "Cadastro enviado para análise.",
      },
      { status: 201, headers: noCacheHeaders() }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao enviar cadastro de afiliado.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: noCacheHeaders() }
    );
  }
}
