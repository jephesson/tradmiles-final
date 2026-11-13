/**
 * Modelos da OpenAI usados no sistema + chamada ao Chat Completions com tolerância a mudanças.
 *
 * GPT-4o / GPT-4o mini foram descontinuados (desligam em 14/01/2027).
 * - Texto (Pix, cotação, passageiros em texto, análises): GPT-6 Luna.
 * - Prints e documentos (Telegram, fichas, e-tickets): GPT-6.1 Terra (bom em leitura visual).
 * As variáveis OPENAI_*_MODEL continuam valendo se estiverem configuradas.
 */
export const AI_MODEL_FAST = "gpt-6-luna";
export const AI_MODEL_VISION = "gpt-6.1-terra";

/** Se o modelo novo falhar, tenta o antigo (funciona até 14/01/2027). */
const LEGACY_FALLBACK: Record<string, string> = {
  [AI_MODEL_FAST]: "gpt-4o-mini",
  [AI_MODEL_VISION]: "gpt-4o",
};

/**
 * Esforço de raciocínio padrão.
 * Texto: baixo (pensa um pouco para não errar na extração, sem pesar no tempo).
 * Prints/documentos: médio (entender tabela e layout da imagem pede mais).
 */
const DEFAULT_EFFORT: Record<string, string> = {
  [AI_MODEL_FAST]: "low",
  [AI_MODEL_VISION]: "medium",
};

type Body = Record<string, unknown>;

function isGpt6(model: unknown) {
  return /^gpt-6/i.test(String(model || ""));
}

/** Ajusta o corpo quando a API recusa um parâmetro. Devolve null se não souber o que mudar. */
function adjustForError(body: Body, errText: string): Body | null {
  const t = errText.toLowerCase();
  const next = { ...body };
  if (t.includes("max_tokens") && "max_tokens" in next) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
    return next;
  }
  if (t.includes("temperature") && "temperature" in next) {
    delete next.temperature;
    return next;
  }
  if (t.includes("reasoning_effort") && "reasoning_effort" in next) {
    delete next.reasoning_effort;
    return next;
  }
  if (t.includes("response_format") && "response_format" in next) {
    delete next.response_format;
    return next;
  }
  return null;
}

function modelProblem(status: number, errText: string) {
  const t = errText.toLowerCase();
  return (
    status === 404 ||
    t.includes("model_not_found") ||
    t.includes("does not exist") ||
    t.includes("do not have access") ||
    (t.includes("model") && (t.includes("not supported") || t.includes("invalid")))
  );
}

/**
 * Substituto direto de `fetch(url, init)` para `/chat/completions`.
 * - GPT-6: tira `temperature` e troca `max_tokens` por `max_completion_tokens` se a API reclamar.
 * - Se o modelo novo não responder, refaz com o modelo antigo equivalente.
 */
export async function openaiChatFetch(url: string, init: RequestInit): Promise<Response> {
  let body: Body;
  try {
    body = JSON.parse(String(init.body || "{}"));
  } catch {
    return fetch(url, init);
  }
  const originalBody = { ...body };
  if (isGpt6(body.model) && body.reasoning_effort === undefined && DEFAULT_EFFORT[String(body.model)]) {
    body.reasoning_effort = DEFAULT_EFFORT[String(body.model)];
  }

  let usedFallback = false;
  let last: { status: number; statusText: string; headers: Headers; text: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { ...init, body: JSON.stringify(body) });
    if (res.ok) return res;
    const text = await res.text().catch(() => "");
    last = { status: res.status, statusText: res.statusText, headers: res.headers, text };
    if (res.status !== 400 && res.status !== 404) break;

    const adjusted = adjustForError(body, text);
    if (adjusted) {
      body = adjusted;
      continue;
    }
    const legacy = LEGACY_FALLBACK[String(body.model)];
    if (!usedFallback && legacy && modelProblem(res.status, text)) {
      console.warn(`[openai] ${String(body.model)} falhou (${res.status}); usando ${legacy}.`, text.slice(0, 300));
      usedFallback = true;
      body = { ...originalBody, model: legacy };
      continue;
    }
    break;
  }

  return new Response(last?.text ?? "", {
    status: last?.status ?? 500,
    statusText: last?.statusText,
    headers: last?.headers,
  });
}
