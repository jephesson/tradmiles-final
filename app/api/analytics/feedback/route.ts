import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-server";
import { compactAnalyticsForAi } from "@/lib/analytics-feedback-compact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PROMPT = 2000;
const MAX_PAYLOAD_CHARS = 48_000;

export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession();
    const team = String((sess as any)?.team || "");
    if (!team) {
      return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const prompt = String(body?.prompt || "").trim();
    if (prompt.length < 8) {
      return NextResponse.json(
        { ok: false, error: "Escreva o que você quer que a análise cubra." },
        { status: 400 }
      );
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json(
        { ok: false, error: `O pedido pode ter no máximo ${MAX_PROMPT} caracteres.` },
        { status: 400 }
      );
    }

    const raw = body?.analytics;
    const alreadyCompact =
      raw &&
      typeof raw === "object" &&
      (raw.filtros != null || Array.isArray(raw.hojePorFuncionario));
    const snapshot = alreadyCompact ? raw : compactAnalyticsForAi(raw);
    let snapshotJson = JSON.stringify(snapshot);
    if (snapshotJson.length > MAX_PAYLOAD_CHARS) {
      snapshotJson = snapshotJson.slice(0, MAX_PAYLOAD_CHARS) + "…";
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OpenAI não está configurada neste ambiente." },
        { status: 503 }
      );
    }

    const model =
      process.env.OPENAI_ANALYTICS_MODEL ||
      process.env.OPENAI_DOCUMENT_MODEL ||
      "gpt-4o-mini";
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              "Você analisa o desempenho comercial da TradeMiles (milhas, balcão, equipe). " +
              "Os números do JSON já estão em reais (BRL), não em centavos. " +
              "Responda em português do Brasil. Siga o pedido do usuário: se ele pedir um texto, escreva esse texto. " +
              "Use só os dados fornecidos; não invente valores. Se faltar dado para o pedido, diga o que falta. " +
              "Cite números concretos. Não exponha CPF, e-mail nem credencial. Sem markdown pesado: títulos curtos e parágrafos ou bullets simples.",
          },
          {
            role: "user",
            content: `Pedido:\n${prompt}\n\nDados (valores em R$):\n${snapshotJson}`,
          },
        ],
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        String(json?.error?.message || "").trim() ||
        `OpenAI retornou ${res.status}.`;
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    const text = String(json?.choices?.[0]?.message?.content || "")
      .replace(/\s+$/g, "")
      .trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: "A IA não devolveu texto. Tente de novo." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao gerar o feedback." },
      { status: 400 }
    );
  }
}
