// app/api/cedentes/termos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { CedenteStatus, TermTriState, TermResponseTime } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERM_MESSAGE = `Olá! Tudo bem?

Aqui é a Vias Aéreas LTDA (CNPJ 63.817.773/0001-85).
Estamos entrando em contato para alinhar novas exigências de segurança que passaram a ocorrer com mais frequência nas emissões de passagens, e que agora exigem participação do titular da conta em alguns momentos.

✅ Novas obrigações e procedimentos (quando solicitados)

Livelo (eventual): realização de biometria quando houver bloqueio/validação de segurança.

Smiles (importante): durante algumas emissões pode ser necessário responder SMS de validação. Isso é essencial para garantir que a emissão seja concluída corretamente e que o passageiro consiga viajar sem problemas.

Comprovação de identidade (eventual): envio de documentos, como RG, CPF e comprovante de residência, caso a plataforma solicite para confirmar titularidade.

LATAM (mudança de regra): devido a uma atualização de segurança, toda emissão de passagem passará por biometria do titular quando solicitada. Antes, normalmente bastava o SMS para transferência/validação e o processo ficava totalmente conosco. Agora existe esse passo a mais.

⚠️ Importante: o lucro das contas permanece o mesmo e o risco da operação (lucro e prejuízo) continua sendo nosso, como sempre foi. A diferença é apenas a necessidade de participação do titular nas validações quando o sistema exigir.

💰 Regras de pagamento por transação

R$ 80,00 nas transações em que for necessária biometria.

R$ 50,00 nas transações em que não for necessária biometria.

A quantidade de biometrias é variável, mas em média devemos solicitar de 3 a 10 biometrias ao longo de cada investimento/transações do período. Se o investimento for maior, pagaremos proporcionalmente mais, conforme o volume de emissões/validações.

O valor de R$ 80,00 inclui:

as validações por SMS (geralmente equivalentes a 2–3 SMS para conclusão da compra)

R$ 30,00 referentes a todas as biometrias necessárias dentro da transação.

✅ Por favor, responda marcando uma das opções abaixo

( ) 1. Desejo continuar com investimento na Smiles, Livelo e Esfera
(Ciente de: biometria eventual quando necessário, envio de documentos quando solicitado, responder SMS da Smiles, e valor pago de R$ 50 por transação)

( ) 2. Desejo continuar também com a LATAM, realizando a biometria quando for solicitado
(Valor pago de R$ 80 por transação quando houver biometria)

( ) 3. Desejo cancelar a parceria

Se você marcar a opção 2 (LATAM), por favor informe também os horários em que você consegue realizar as biometrias (ex.: “dias úteis 09h–12h / 14h–18h” ou “noite após 20h”).

Agradecemos a parceria e ficamos à disposição para qualquer dúvida.

Vias Aéreas LTDA
CNPJ 63.817.773/0001-85`;

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

const TRI = new Set<string>(["YES", "NO", "NO_RESPONSE"]);
const RT = new Set<string>(["H1", "H2", "H3", "GT3"]);

function toTri(v: unknown): TermTriState | null {
  const s = asString(v).trim().toUpperCase();
  return TRI.has(s) ? (s as TermTriState) : null;
}

function toRT(v: unknown): TermResponseTime | null {
  const s = asString(v).trim().toUpperCase();
  return RT.has(s) ? (s as TermResponseTime) : null;
}

function responseTimePoints(rt: TermResponseTime | null) {
  switch (rt) {
    case "H1":
      return 30;
    case "H2":
      return 20;
    case "H3":
      return 10;
    case "GT3":
      return 0;
    default:
      return 0;
  }
}

function phoneToWaNumber(raw: string | null | undefined) {
  const d = String(raw || "").replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 11) return `55${d}`;
  if (d.length === 10) return `55${d}`;
  return d;
}

function buildWaLink(waNumber: string, text?: string) {
  const base = `https://wa.me/${waNumber}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

function computeScore(review: {
  responseTime?: TermResponseTime | null;
  disponibilidadePoints?: number | null;
}) {
  const rtPts = responseTimePoints(review?.responseTime ?? null);
  const disp = clampInt(review?.disponibilidadePoints ?? 0, 0, 70);
  const score = rtPts + disp; // 0..100
  return { rtPts, disp, score };
}

function computeColor(review: {
  aceiteOutros?: TermTriState | null;
  aceiteLatam?: TermTriState | null;
  exclusaoDef?: TermTriState | null;
}) {
  if (review?.exclusaoDef === "YES") return "RED";
  if (review?.aceiteOutros === "YES" && review?.aceiteLatam === "YES") return "GREEN";
  if (review?.aceiteOutros === "NO_RESPONSE" || review?.aceiteLatam === "NO_RESPONSE") return "GRAY";
  return "YELLOW";
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const termoVersao = (searchParams.get("versao") || "v1").trim();

    // ✅ MESMA BASE DO "approved": todos os cedentes aprovados
    const cedentes = await prisma.cedente.findMany({
      where: { status: CedenteStatus.APPROVED },
      orderBy: { nomeCompleto: "asc" },
      select: {
        // base “approved”
        id: true,
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        createdAt: true,

        // termos / whatsapp
        telefone: true,

        owner: { select: { id: true, name: true, login: true } },

        termReviews: {
          where: { termoVersao },
          take: 1,
          select: {
            aceiteOutros: true,
            aceiteLatam: true,
            exclusaoDef: true,
            responseTime: true,
            disponibilidadePoints: true,
            updatedAt: true,
            termoVersao: true,
            cedenteId: true,
          },
        },
      },
    });

    const data = cedentes.map((c) => {
      const review = c.termReviews[0] || null;

      const waNumber = phoneToWaNumber(c.telefone);
      const waUrl = waNumber ? buildWaLink(waNumber) : null;
      const waUrlTermo = waNumber ? buildWaLink(waNumber, TERM_MESSAGE) : null;

      const scorePack = review ? computeScore(review) : { rtPts: 0, disp: 0, score: 0 };
      const color = review ? computeColor(review) : "GRAY";

      return {
        id: c.id,
        identificador: c.identificador,
        nomeCompleto: c.nomeCompleto,
        cpf: c.cpf,
        createdAt: c.createdAt,
        owner: c.owner,
        telefone: c.telefone,

        whatsapp: {
          waNumber,
          waUrl,
          waUrlTermo,
          termoTexto: TERM_MESSAGE,
        },

        review,
        score: {
          responseTimePoints: scorePack.rtPts,
          disponibilidadePoints: scorePack.disp,
          total: scorePack.score,
          color,
        },
      };
    });

    return NextResponse.json(
      { ok: true, termoVersao, termoTexto: TERM_MESSAGE, data },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("GET /api/cedentes/termos ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const cedenteId = asString(body?.cedenteId).trim();
    const termoVersao = (asString(body?.termoVersao).trim() || "v1").trim();

    if (!cedenteId) {
      return NextResponse.json({ ok: false, error: "cedenteId é obrigatório." }, { status: 400 });
    }

    const aceiteOutros = toTri(body?.aceiteOutros);
    const aceiteLatam = toTri(body?.aceiteLatam);
    const exclusaoDef = toTri(body?.exclusaoDef);
    const responseTime = toRT(body?.responseTime);
    const disponibilidadePoints = clampInt(body?.disponibilidadePoints, 0, 70);

    const review = await prisma.cedenteTermReview.upsert({
      where: {
        // ✅ seu unique correto
        cedenteId_termoVersao: { cedenteId, termoVersao },
      },
      create: {
        cedenteId,
        termoVersao,
        aceiteOutros,
        aceiteLatam,
        exclusaoDef,
        responseTime,
        disponibilidadePoints,
      },
      update: {
        aceiteOutros,
        aceiteLatam,
        exclusaoDef,
        responseTime,
        disponibilidadePoints,
      },
      select: {
        aceiteOutros: true,
        aceiteLatam: true,
        exclusaoDef: true,
        responseTime: true,
        disponibilidadePoints: true,
        updatedAt: true,
        termoVersao: true,
        cedenteId: true,
      },
    });

    const scorePack = computeScore(review);
    const color = computeColor(review);

    return NextResponse.json(
      {
        ok: true,
        data: {
          review,
          score: {
            responseTimePoints: scorePack.rtPts,
            disponibilidadePoints: scorePack.disp,
            total: scorePack.score,
            color,
          },
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    console.error("POST /api/cedentes/termos ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro interno." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
