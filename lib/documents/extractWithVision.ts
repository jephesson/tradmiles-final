import type { DocumentExtractResult, ExtractedPassenger } from "./types";

export const DOCUMENT_EXTRACT_SYSTEM = `Você lê documentos de identidade brasileiros (RG antigo/novo, CIN, CNH física/digital, comprovante CPF, certidão de nascimento) em fotos — e também prints de WhatsApp/Telegram com ficha de passageiro.

Regras:
1. Extraia APENAS o TITULAR de cada documento (ignore filiação/pais, avós, diretor, órgão).
2. Se a mesma pessoa aparecer em frente+verso ou em vários docs na mesma foto, unifique em UM passageiro.
3. Extraia TODOS os passageiros visíveis (1, 2, 3 ou mais). Duas fichas/docs na mesma imagem → dois passageiros. Várias imagens → una o conjunto sem duplicar a mesma pessoa.
4. Campos: fullName, birthDateBR (DD/MM/YYYY), cpf (11 dígitos se legível), gender (M|F só se o doc tiver Sexo; NÃO invente pelo nome), documentNumber (RG se sem CPF), sourceDocs, confidence, notes.
5. Asteriscos, campos rasurados ou ilegíveis → null nesse campo + note.
6. CPF no formato 000.000.000-00 ou só dígitos; normalize para 11 dígitos quando possível.
7. Datas com ponto (03.04.1969) → DD/MM/YYYY.
8. Certidão de nascimento: nome do registrado, data, CPF se houver, sexo se houver.
9. Print de Telegram/WhatsApp: leia fichas/tabelas (Nome, Sobrenome, CPF, Data de nascimento) da emissão atual. Também leia blocos "NOME:" / "CPF:" / "NASCIMENTO:" mesmo no meio de um print de conversa. Junte Nome+Sobrenome em fullName. Ignore só o papo e valores de milhas/voo — extraia os nomes, CPFs e nascimentos visíveis.
10. Não invente CPF. Não invente sexo.
11. Responda SOMENTE JSON válido no schema pedido.`;

export function buildExtractUserPrompt(imageCount: number, emissionHint = "") {
  const scope = emissionHint
    ? `\nContexto da emissão atual:\n${emissionHint}\n`
    : "";
  return `Analise ${imageCount} imagem(ns) (documento e/ou print de Telegram/WhatsApp). Extraia os passageiros desta emissão.${scope}Retorne JSON:
{
  "passengers": [
    {
      "fullName": "string",
      "birthDateBR": "DD/MM/YYYY ou null",
      "cpf": "11 dígitos ou null",
      "gender": "M" | "F" | null,
      "documentNumber": "string ou null",
      "sourceDocs": ["CNH"|"RG_frente"|"RG_verso"|"CIN"|"CPF"|"CERTIDAO"|"OUTRO"],
      "confidence": "high"|"medium"|"low",
      "notes": "string ou null"
    }
  ],
  "warnings": ["string"]
}`;
}

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function normalizeBirth(br: unknown): string | null {
  const s = String(br || "").trim();
  if (!s || s.toLowerCase() === "null") return null;
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = Number(yyyy) > 50 ? `19${yyyy}` : `20${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeGender(g: unknown): "M" | "F" | null {
  const s = String(g || "")
    .trim()
    .toUpperCase();
  if (s === "F" || s === "FEM" || s === "FEMININO" || s === "FEMALE") return "F";
  if (s === "M" || s === "MASC" || s === "MASCULINO" || s === "MALE") return "M";
  return null;
}

function normalizePassenger(raw: any): ExtractedPassenger | null {
  const fullName = String(raw?.fullName || raw?.nome || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!fullName || fullName.length < 3) return null;

  let cpf = onlyDigits(String(raw?.cpf || ""));
  if (cpf.length !== 11) cpf = "";

  return {
    fullName,
    birthDateBR: normalizeBirth(raw?.birthDateBR ?? raw?.nascimento),
    cpf: cpf || null,
    gender: normalizeGender(raw?.gender ?? raw?.sexo),
    documentNumber: String(raw?.documentNumber || raw?.rg || "").trim() || null,
    sourceDocs: Array.isArray(raw?.sourceDocs)
      ? raw.sourceDocs.map((x: unknown) => String(x))
      : [],
    confidence:
      raw?.confidence === "low" || raw?.confidence === "medium"
        ? raw.confidence
        : "high",
    notes: raw?.notes ? String(raw.notes) : null,
  };
}

export function parseModelJson(text: string): DocumentExtractResult {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } else {
      throw new Error("Resposta do modelo não é JSON válido.");
    }
  }

  const passengers = (Array.isArray(parsed?.passengers) ? parsed.passengers : [])
    .map(normalizePassenger)
    .filter(Boolean) as ExtractedPassenger[];

  const warnings = Array.isArray(parsed?.warnings)
    ? parsed.warnings.map((w: unknown) => String(w))
    : [];

  return { passengers, warnings, rawModelText: cleaned };
}

export type VisionImage = {
  mimeType: string;
  base64: string;
};

/**
 * Chama OpenAI-compatible Vision (gpt-4o / gpt-4o-mini).
 * Requer OPENAI_API_KEY (ou DOCUMENT_AI_API_KEY) no ambiente.
 */
export async function extractPassengersFromImages(
  images: VisionImage[],
  emissionHint = ""
): Promise<DocumentExtractResult> {
  if (!images.length) {
    return { passengers: [], warnings: ["Nenhuma imagem enviada."] };
  }

  const apiKey =
    process.env.DOCUMENT_AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";
  if (!apiKey) {
    throw new Error(
      "Configure OPENAI_API_KEY (ou DOCUMENT_AI_API_KEY) no ambiente para ler documentos."
    );
  }

  const model =
    process.env.DOCUMENT_AI_MODEL ||
    process.env.OPENAI_DOCUMENT_MODEL ||
    "gpt-4o";

  const baseUrl = (
    process.env.DOCUMENT_AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  const content: any[] = [
    { type: "text", text: buildExtractUserPrompt(images.length, emissionHint) },
    ...images.map((img) => ({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
        detail: "high",
      },
    })),
  ];

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: DOCUMENT_EXTRACT_SYSTEM },
        { role: "user", content },
      ],
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      json?.error?.message ||
      json?.error ||
      `Falha na API de visão (${res.status}).`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const text = json?.choices?.[0]?.message?.content || "";
  return parseModelJson(text);
}
