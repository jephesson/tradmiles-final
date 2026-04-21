import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "");
}

function cleanDocument(value: unknown) {
  const digits = onlyDigits(value);
  if (!digits) return "__INVALID__";
  if (digits.length !== 11 && digits.length !== 14) return "__INVALID__";
  return digits;
}

function cleanOptionalUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "__INVALID__";
    return url.toString();
  } catch {
    return "__INVALID__";
  }
}

function parseCommissionBps(value: unknown) {
  let raw = String(value ?? "").trim().replace("%", "");
  raw = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  const params = await ctx.params;
  return String(params.id || "").trim();
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSessionServer();
    const team = String(session?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "ID obrigatório." }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "Informe o nome do afiliado." }, { status: 400 });
    }

    const document = cleanDocument(body.document);
    if (document === "__INVALID__") {
      return NextResponse.json({ ok: false, error: "CPF/CNPJ inválido." }, { status: 400 });
    }

    const flightSalesLink = cleanOptionalUrl(body.flightSalesLink);
    if (flightSalesLink === "__INVALID__") {
      return NextResponse.json({ ok: false, error: "Link de venda de passagens inválido." }, { status: 400 });
    }
    if (!flightSalesLink) {
      return NextResponse.json({ ok: false, error: "Informe o link de venda de passagens." }, { status: 400 });
    }

    const pointsPurchaseLink = cleanOptionalUrl(body.pointsPurchaseLink);
    if (pointsPurchaseLink === "__INVALID__") {
      return NextResponse.json({ ok: false, error: "Link de compra de pontos inválido." }, { status: 400 });
    }
    if (!pointsPurchaseLink) {
      return NextResponse.json({ ok: false, error: "Informe o link de compra de pontos." }, { status: 400 });
    }

    const commissionBps = parseCommissionBps(body.commissionPercent);
    if (commissionBps === null) {
      return NextResponse.json(
        { ok: false, error: "Percentual de comissão inválido. Use de 0 a 100." },
        { status: 400 }
      );
    }

    const existing = await prisma.affiliate.findFirst({
      where: { id, team },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Afiliado não encontrado." }, { status: 404 });
    }

    const affiliate = await prisma.affiliate.update({
      where: { id },
      data: {
        name,
        document,
        flightSalesLink,
        pointsPurchaseLink,
        commissionBps,
        isActive: body.isActive === false ? false : true,
      },
      include: {
        _count: { select: { clients: true } },
      },
    });

    return NextResponse.json({ ok: true, data: { affiliate } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Erro ao atualizar afiliado.") },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await getSessionServer();
    const team = String(session?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const id = await getId(ctx);
    if (!id) return NextResponse.json({ ok: false, error: "ID obrigatório." }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const existing = await prisma.affiliate.findFirst({
      where: { id, team },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Afiliado não encontrado." }, { status: 404 });
    }

    const affiliate = await prisma.affiliate.update({
      where: { id },
      data: {
        isActive: body.isActive === false ? false : true,
      },
      include: {
        _count: { select: { clients: true } },
      },
    });

    return NextResponse.json({ ok: true, data: { affiliate } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "Erro ao alterar status do afiliado.") },
      { status: 500 }
    );
  }
}
