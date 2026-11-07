import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/require-session";
import type { VoarFacilFill, VoarFacilOrderData } from "@/lib/voarfacil/order";
import { isAllowedLatamPdfUrl } from "@/lib/latam/parseReceiptPdf";
import { fetchLatamReceiptText } from "@/lib/latam/receiptText";
import { extractEticketsForPassengers } from "@/lib/latam/extractEtickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isoDate(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Monta os dados para o formulário "Emitido" do Voar Fácil a partir da venda salva
 * (localizador, ordem, taxa por passageiro, cedente como fonte) e liga o pedido à venda.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let sess;
  try {
    sess = requireSession(req);
  } catch {
    return bad("Não autenticado", 401);
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const saleId = String(body?.saleId || "").trim();
  const pdfUrl = String(body?.pdfUrl || "").trim();
  if (!saleId) return bad("saleId é obrigatório.");

  const order = await prisma.voarFacilOrder.findFirst({ where: { id, team: sess.team } });
  if (!order) return bad("Pedido não encontrado.", 404);

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      numero: true,
      locator: true,
      purchaseCode: true,
      embarqueFeeCents: true,
      passengers: true,
      cedente: { select: { nomeCompleto: true, cpf: true, emailCriado: true, dataNascimento: true } },
    },
  });
  if (!sale) return bad("Venda não encontrada.", 404);

  const data = order.data as unknown as VoarFacilOrderData;
  const paxFee = Math.max(1, (data.counts?.adt || 0) + (data.counts?.chd || 0) || sale.passengers || 1);
  const perPax = Math.round(Number(sale.embarqueFeeCents || 0) / paxFee);
  const roundTrip = data.trip === "IDA_VOLTA";
  // Venda guarda só o total: divide meio a meio entre ida e volta (ajuste na página se precisar)
  const ida = roundTrip ? Math.ceil(perPax / 2) : perPax;
  const volta = roundTrip ? perPax - ida : null;

  // E-tickets: lê o comprovante na hora (PDF não é guardado, só os números)
  let etickets: Record<string, string> = {};
  let eticketNote: string | null = null;
  if (pdfUrl) {
    if (!isAllowedLatamPdfUrl(pdfUrl)) {
      eticketNote = "Link do comprovante não reconhecido — e-tickets ficam para preencher.";
    } else {
      const text = await fetchLatamReceiptText(pdfUrl).catch(() => null);
      if (!text) eticketNote = "Não consegui ler o comprovante — e-tickets ficam para preencher.";
      else {
        const names = (data.passengers || []).map((p) => `${p.firstName} ${p.lastName}`.trim());
        etickets = await extractEticketsForPassengers(text, names).catch(() => ({}));
        eticketNote = `${Object.keys(etickets).length} de ${names.length} e-ticket(s) lidos do comprovante.`;
      }
    }
  }

  const fill: VoarFacilFill = {
    saleId: sale.id,
    saleNumero: sale.numero,
    locator: String(sale.locator || "").toUpperCase(),
    purchaseCode: String(sale.purchaseCode || "").toUpperCase(),
    taxIdaPerPaxCents: ida,
    taxVoltaPerPaxCents: volta,
    fonte: {
      nome: sale.cedente?.nomeCompleto || "",
      cpf: String(sale.cedente?.cpf || "").replace(/\D/g, ""),
      email: sale.cedente?.emailCriado || "",
      birthIso: isoDate(sale.cedente?.dataNascimento),
    },
    etickets,
  };

  await prisma.voarFacilOrder.update({
    where: { id: order.id },
    data: { fill: fill as any, saleId: sale.id },
  });

  return NextResponse.json({
    ok: true,
    data: { url: order.url, fill, eticketNote, overLimit: data.limitTaxCents > 0 && Number(sale.embarqueFeeCents || 0) > data.limitTaxCents },
  });
}
