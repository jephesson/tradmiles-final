import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AFFILIATE_STATUS,
  buildAffiliateReferralLinks,
  normalizeAffiliateLogin,
} from "@/lib/affiliates/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  const origin = process.env.AFFILIATE_REFERRAL_ALLOWED_ORIGIN?.trim() || "*";
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = normalizeAffiliateLogin(searchParams.get("ref"));

    if (!ref) {
      return NextResponse.json(
        { ok: false, error: "Informe o parâmetro ref." },
        { status: 400, headers: corsHeaders() }
      );
    }

    const affiliate = await prisma.affiliate.findFirst({
      where: {
        login: ref,
        isActive: true,
        status: AFFILIATE_STATUS.APPROVED,
      },
      select: {
        id: true,
        name: true,
        login: true,
        flightSalesLink: true,
        pointsPurchaseLink: true,
        commissionBps: true,
      },
    });

    if (!affiliate?.login) {
      return NextResponse.json(
        { ok: false, error: "Afiliado não encontrado ou ainda não aprovado." },
        { status: 404, headers: corsHeaders() }
      );
    }

    const generatedLinks = buildAffiliateReferralLinks(affiliate.login);

    return NextResponse.json(
      {
        ok: true,
        data: {
          affiliate: {
            id: affiliate.id,
            name: affiliate.name,
            ref: affiliate.login,
            commissionBps: affiliate.commissionBps,
          },
          links: {
            flightSales:
              affiliate.flightSalesLink || generatedLinks.flightSalesLink,
            pointsPurchase:
              affiliate.pointsPurchaseLink || generatedLinks.pointsPurchaseLink,
          },
        },
      },
      { headers: corsHeaders() }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao resolver afiliado.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: corsHeaders() }
    );
  }
}
