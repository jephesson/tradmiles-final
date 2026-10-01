import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import {
  applyManualExclusions,
  buildDailySeries,
  compactCaixaForAi,
  monthlyAverages,
  type CaixaSnapshotPoint,
  type ManualExclusion,
} from "@/lib/caixa-snapshot-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function asISO(v: Date | string | null | undefined) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(v);
}

async function loadPoints(team: string): Promise<CaixaSnapshotPoint[]> {
  const [resumoRows, caixaRows] = await Promise.all([
    prisma.cashSnapshot.findMany({
      where: { team },
      orderBy: [{ createdAt: "asc" }, { date: "asc" }],
      take: 3000,
      select: { date: true, createdAt: true, totalLiquido: true },
    }),
    prisma.caixaImediatoSnapshot.findMany({
      where: { team },
      orderBy: [{ createdAt: "asc" }, { date: "asc" }],
      take: 3000,
      select: { date: true, createdAt: true, totalLiquidoCents: true },
    }),
  ]);

  const byMoment = new Map<string, CaixaSnapshotPoint>();
  const stamp = (createdAt: Date, date: Date | string) => {
    const iso = createdAt?.toISOString?.() || asISO(date);
    return iso || asISO(date);
  };

  for (const r of resumoRows) {
    const capturedAt = stamp(r.createdAt, r.date);
    if (!capturedAt) continue;
    const row = byMoment.get(capturedAt) || { capturedAt, resumoCents: null, caixaCents: null };
    row.resumoCents = Number(r.totalLiquido || 0);
    byMoment.set(capturedAt, row);
  }
  for (const r of caixaRows) {
    const capturedAt = stamp(r.createdAt, r.date);
    if (!capturedAt) continue;
    const row = byMoment.get(capturedAt) || { capturedAt, resumoCents: null, caixaCents: null };
    row.caixaCents = Number(r.totalLiquidoCents || 0);
    byMoment.set(capturedAt, row);
  }

  return [...byMoment.values()].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function GET() {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }
    const points = await loadPoints(team);
    const daily = buildDailySeries(points);
    return NextResponse.json({
      ok: true,
      points,
      daily,
      months: monthlyAverages(daily),
    });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: msg || "Erro ao carregar o caixa." }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const note = String(body?.note || "").trim().slice(0, 1200);
    const rawEx = Array.isArray(body?.exclusions) ? body.exclusions : [];
    const exclusions: ManualExclusion[] = rawEx
      .map((e: any) => ({
        dayKey: String(e?.dayKey || "").slice(0, 12),
        resumo: Boolean(e?.resumo),
        caixa: Boolean(e?.caixa),
      }))
      .filter((e: ManualExclusion) => e.dayKey && (e.resumo || e.caixa))
      .slice(0, 400);

    const points = await loadPoints(team);
    const dailyRaw = buildDailySeries(points);
    const daily = applyManualExclusions(dailyRaw, exclusions);
    const months = monthlyAverages(daily);

    const compact = compactCaixaForAi({
      exclusions,
      months,
      lastDaily: daily,
    });

    const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OpenAI não está configurada neste ambiente." },
        { status: 503 }
      );
    }

    const model =
      process.env.OPENAI_CAIXA_MODEL ||
      process.env.OPENAI_ANALYTICS_MODEL ||
      "gpt-4o";
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

    const extra = note ? `\nPedido extra do usuário:\n${note}\n` : "";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 2800,
        messages: [
          {
            role: "system",
            content:
              "Você é um CFO conversando com o dono da TradeMiles (milhas aéreas no Brasil). " +
              "Escreva em português do Brasil, no tom de um briefing longo do ChatGPT: parágrafos seguidos, " +
              "leitura humana, opinião fundamentada. Não use lista numerada rígida, não abra com 'segue a análise', " +
              "não invente números. Compare mês a mês. Separe com clareza caixa imediato (liquidez) e resumo/total " +
              "(patrimônio operacional com milhas). Fale de ritmo, picos, recuos, divergência entre as duas curvas, " +
              "o que parece sazonal vs ruído, e o que vale olhar agora. Se o dono tirou pontos na mão, respeite isso. " +
              "Termine com 3 perguntas ou checagens concretas para o dono, em frases, não em checklist burocrático.",
          },
          {
            role: "user",
            content: `Analise a evolução do caixa manual da empresa.${extra}\nDados:\n${JSON.stringify(compact)}`,
          },
        ],
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = String(json?.error?.message || "").trim() || `OpenAI retornou ${res.status}.`;
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    const text = String(json?.choices?.[0]?.message?.content || "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "A IA não devolveu texto." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, text, months, excluded: exclusions.length });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao gerar a análise." },
      { status: 400 }
    );
  }
}
