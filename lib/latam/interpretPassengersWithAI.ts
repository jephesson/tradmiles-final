import type { ParsedPassenger, TitularContact } from "@/lib/latam/parsePassengerText";
import {
  generateValidCpf,
  isValidCpf,
  parsePassengerText,
} from "@/lib/latam/parsePassengerText";

const SYSTEM = `Você extrai passageiros de textos de reserva / WhatsApp / documentos BR.
Responda SOMENTE JSON válido:
{
  "passengers": [
    {
      "fullName": string,
      "birthDate": string | null,
      "cpf": string | null,
      "gender": "M" | "F" | null,
      "email": string | null,
      "phone": string | null,
      "isInfant": boolean
    }
  ]
}
Regras:
- fullName = nome completo como na passagem (sem rótulos tipo "Pax", "bebê", "do bebê").
- birthDate em DD/MM/YYYY ou YYYY-MM-DD.
- cpf só dígitos ou formatado BR; null se não houver.
- Inclua bebês (isInfant=true). Não invente passageiros.
- Ignore linhas de contato soltas (e-mail/telefone do grupo) se não forem de um pax.`;

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function toISODate(d: string, m: string, y: string): string | null {
  let year = Number(y);
  if (y.length === 2) year += year >= 50 ? 1900 : 2000;
  const month = Number(m);
  const day = Number(d);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return iso;
}

function parseAiBirthDate(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (br) return toISODate(br[1], br[2], br[3]);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function toBRDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function toLatamDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = String(full || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function mapAiPassenger(raw: any, block: string): ParsedPassenger | null {
  const fullName = String(raw?.fullName || "")
    .replace(/^(?:pax\s+do\s+beb[eê]|pax|beb[eê]|do\s+beb[eê])\s*[:\-–.]?\s*/i, "")
    .trim();
  if (!fullName) return null;
  const { firstName, lastName } = splitFullName(fullName);
  const birthDate = parseAiBirthDate(raw?.birthDate);
  let cpf = onlyDigits(String(raw?.cpf || ""));
  if (cpf.length !== 11) cpf = "";
  const genderRaw = String(raw?.gender || "").toUpperCase();
  const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;
  const email = raw?.email ? String(raw.email).trim().toLowerCase() : null;
  const phoneDig = onlyDigits(String(raw?.phone || ""));
  const phone = phoneDig.length >= 10 ? phoneDig : null;

  let cpfFinal = cpf || null;
  let cpfGenerated = false;
  if (!cpfFinal) {
    cpfFinal = generateValidCpf();
    cpfGenerated = true;
  }

  return {
    firstName,
    lastName: lastName || firstName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf: cpfFinal,
    cpfValid: cpfFinal ? isValidCpf(cpfFinal) : null,
    cpfGenerated,
    email,
    phone,
    gender,
    raw: block.trim(),
  };
}

/** OpenAI só quando o regex não bastar. Retorna null se API/chave falhar. */
export async function interpretPassengersWithAI(
  text: string,
  opts?: { expectedCount?: number }
): Promise<ParsedPassenger[] | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DOCUMENT_AI_API_KEY || "";
  if (!apiKey) return null;

  const model =
    process.env.OPENAI_PASSENGER_MODEL ||
    process.env.OPENAI_DOCUMENT_MODEL ||
    "gpt-4o-mini";
  const baseUrl = (
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  const expected = Math.max(0, Math.trunc(Number(opts?.expectedCount) || 0));
  const hint =
    expected > 0
      ? `Esperado cerca de ${expected} passageiro(s) no texto (incluindo bebê se houver).`
      : "Extraia todos os passageiros visíveis.";

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
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${hint}\n\nTexto:\n${String(text || "").slice(0, 12000)}`,
        },
      ],
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) return null;

  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const data = JSON.parse(String(raw));
    const list = Array.isArray(data?.passengers) ? data.passengers : [];
    const out: ParsedPassenger[] = [];
    for (const item of list) {
      const mapped = mapAiPassenger(item, String(text || ""));
      if (mapped) out.push(mapped);
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * Regex primeiro; se vier menos que o esperado, tenta OpenAI.
 * Se a IA falhar, mantém o resultado do regex (não quebra o fluxo).
 */
export async function parsePassengerTextWithFallback(
  raw: string,
  titular?: TitularContact | null,
  opts?: { expectedCount?: number }
): Promise<{
  passengers: ParsedPassenger[];
  source: "regex" | "openai";
}> {
  const regex = parsePassengerText(raw, titular);
  const expected = Math.max(0, Math.trunc(Number(opts?.expectedCount) || 0));

  if (!raw.trim() || expected <= 0 || regex.length >= expected) {
    return { passengers: regex, source: "regex" };
  }

  try {
    const ai = await interpretPassengersWithAI(raw, { expectedCount: expected });
    if (ai && ai.length > regex.length) {
      // Reaplica contato compartilhado via parsePassengerText pipeline: titular
      const withContact = ai.map((p) => ({
        ...p,
        email: p.email || titular?.email || null,
        phone: p.phone || titular?.phone || null,
      }));
      return { passengers: withContact, source: "openai" };
    }
  } catch {
    // ignora — fica no regex
  }

  return { passengers: regex, source: "regex" };
}
