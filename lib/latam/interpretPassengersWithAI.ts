import type { ParsedPassenger, TitularContact } from "@/lib/latam/parsePassengerText";
import {
  collapseDuplicatePassengers,
  extractCpfsFromSource,
  generateValidCpf,
  isValidCpf,
  normalizeCpfInput,
  parsePassengerText,
  passengerParseNeedsAi,
  sortPassengersAdultChildInfant,
} from "@/lib/latam/parsePassengerText";

const SYSTEM = `Você extrai passageiros de textos de reserva / WhatsApp / Telegram / documentos BR.
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
- NÃO coloque F, M, Fem, Masc, Feminino ou Masculino no nome. Isso é sexo: use o campo gender (M ou F). Ex.: "Yreza Cruz 02/03/2000 F 07372135583" → fullName "Yreza Cruz", gender "F".
- birthDate é OBRIGATÓRIO quando aparecer no texto (DD/MM/YYYY ou YYYY-MM-DD).
- Linhas de Passaporte / Passport / RG / Idt NÃO são passageiros — ignore o número e associe ao nome anterior.
- cpf é STRING com 11 dígitos, inclusive zeros à esquerda (ex.: "03323904206"). Nunca envie CPF como número JSON (o zero some). null só se realmente não houver.
- Inclua bebês (isInfant=true). Não invente passageiros.
- Ordem da lista: adultos (12+), depois crianças (2–11), depois bebês (<2).
- Ficha Telegram (Nome / Sobrenome / CPF / Data Nascimento, ou blocos NOME: / CPF: / NASCIMENTO:): junte nome+sobrenome; pode haver vários passageiros no mesmo texto.
- WhatsApp sem rótulo também: nome completo numa linha, CPF (11 dígitos) na seguinte, data (DD/MM/YYYY) na outra; e-mail e telefone podem vir em mensagens seguintes. Extraia mesmo assim.
- Ignore horários de bolha (14:51), print de busca de voo (milhas, horários, aeroportos) e o papo. Não invente passageiro a partir disso.
- Ignore linhas de contato soltas (e-mail/telefone do grupo) se não forem de um pax — mas se houver um passageiro, associe o e-mail/telefone a ele.
- Extraia os passageiros da emissão atual. Se o texto misturar várias vendas, fique só na que o usuário descreveu.
- NUNCA copie a mesma pessoa duas vezes. Quantidade esperada é só uma dica — se o texto tiver 1 pessoa, retorne 1.`;

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
    .filter(Boolean)
    .filter((t) => !/^(?:[fm]|fem|masc|feminino|masculino)\.?$/i.test(t));
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function recoverCpfFromText(text: string, used: Set<string>): string | null {
  for (const cpf of extractCpfsFromSource(text)) {
    if (!used.has(cpf)) return cpf;
  }
  return null;
}

function cpfInText(cpf: string, text: string) {
  return extractCpfsFromSource(text).includes(cpf);
}

function mapAiPassenger(
  raw: any,
  block: string,
  usedCpfs: Set<string>
): ParsedPassenger | null {
  const fullName = String(raw?.fullName || "")
    .replace(/^(?:pax\s+do\s+beb[eê]|pax|beb[eê]|do\s+beb[eê])\s*[:\-–.]?\s*/i, "")
    .trim();
  if (!fullName) return null;
  const genderFromName = fullName
    .split(/\s+/)
    .map((t) => t.toUpperCase().replace(/[^A-Z]/g, ""))
    .find((t) => t === "F" || t === "M" || t === "FEM" || t === "MASC" || t === "FEMININO" || t === "MASCULINO");
  const { firstName, lastName } = splitFullName(fullName);
  const birthDate = parseAiBirthDate(raw?.birthDate);
  const fromText = recoverCpfFromText(block, usedCpfs);
  let cpf = normalizeCpfInput(raw?.cpf) || "";
  if (cpf && usedCpfs.has(cpf)) cpf = "";
  if (cpf && !cpfInText(cpf, block) && fromText) cpf = fromText;
  if (cpf && !cpfInText(cpf, block)) cpf = "";
  if (!cpf) cpf = fromText || "";
  const genderRaw = String(raw?.gender || "").toUpperCase();
  const genderFromToken =
    genderFromName === "F" || genderFromName === "FEM" || genderFromName === "FEMININO"
      ? "F"
      : genderFromName === "M" || genderFromName === "MASC" || genderFromName === "MASCULINO"
        ? "M"
        : null;
  const gender =
    genderRaw === "M" || genderRaw === "F" ? genderRaw : genderFromToken;
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
  opts?: { expectedCount?: number; emissionHint?: string }
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
  const hint = [
    expected > 0
      ? `Pode haver cerca de ${expected} passageiro(s). Não duplique ninguém para chegar nesse número; só extraia quem aparece no texto.`
      : "Extraia os passageiros visíveis desta emissão.",
    opts?.emissionHint || "",
  ]
    .filter(Boolean)
    .join("\n");

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
    const usedCpfs = new Set<string>();
    for (const item of list) {
      const mapped = mapAiPassenger(item, String(text || ""), usedCpfs);
      if (mapped) {
        if (mapped.cpf) usedCpfs.add(mapped.cpf);
        out.push(mapped);
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function parseCompletenessScore(
  passengers: ParsedPassenger[],
  expected: number
): number {
  const unique = collapseDuplicatePassengers(passengers);
  const withDob = unique.filter((p) => p.birthDate && p.firstName).length;
  const missingDob = unique.filter((p) => p.firstName && !p.birthDate).length;
  const realCpf = unique.filter((p) => p.cpf && !p.cpfGenerated).length;
  const genCpf = unique.filter((p) => p.cpfGenerated).length;
  let score = withDob * 10 - missingDob * 8 + realCpf * 8 - genCpf * 4;
  const clones = Math.max(0, passengers.length - unique.length);
  score -= clones * 20;
  if (expected > 0 && unique.length > expected) {
    score -= (unique.length - expected) * 6;
  }
  return score;
}

function nameKey(p: ParsedPassenger) {
  return `${p.firstName || ""} ${p.lastName || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fillCpfFromRegex(
  ai: ParsedPassenger[],
  regex: ParsedPassenger[]
): ParsedPassenger[] {
  const withCpf = regex.filter((r) => r.cpf && !r.cpfGenerated);
  if (!withCpf.length) return ai;
  const missing = ai.filter((p) => !p.cpf || p.cpfGenerated);
  return ai.map((p) => {
    const key = nameKey(p);
    const byName = withCpf.find((r) => nameKey(r) === key);
    const match = byName || (withCpf.length === 1 ? withCpf[0] : null);
    if (match?.cpf) {
      return {
        ...p,
        cpf: match.cpf,
        cpfValid: match.cpfValid,
        cpfGenerated: false,
      };
    }
    if (p.cpf && !p.cpfGenerated) return p;
    return p;
  });
}

/**
 * Regex primeiro; se ficar incompleto (faltou data, gente a mais/a menos), tenta OpenAI.
 * Se a IA falhar, mantém o resultado do regex (não quebra o fluxo).
 */
export async function parsePassengerTextWithFallback(
  raw: string,
  titular?: TitularContact | null,
  opts?: { expectedCount?: number; emissionHint?: string; travelDate?: string | null }
): Promise<{
  passengers: ParsedPassenger[];
  source: "regex" | "openai";
}> {
  const regex = parsePassengerText(raw, titular, opts?.travelDate);
  const expected = Math.max(0, Math.trunc(Number(opts?.expectedCount) || 0));

  const needsAi = passengerParseNeedsAi(regex, expected, raw);
  if (!raw.trim() || !needsAi) {
    return { passengers: regex, source: "regex" };
  }

  try {
    const ai = await interpretPassengersWithAI(raw, {
      expectedCount: expected,
      emissionHint: opts?.emissionHint,
    });
    if (ai?.length) {
      const withContact = collapseDuplicatePassengers(
        fillCpfFromRegex(
          ai.filter((p) => p.firstName && p.birthDate),
          regex
        ).map((p) => {
          const key = `${p.firstName}|${p.lastName}`.toLowerCase();
          const same = regex.find(
            (r) => `${r.firstName}|${r.lastName}`.toLowerCase() === key
          );
          return {
            ...p,
            email: p.email || same?.email || titular?.email || null,
            phone: p.phone || same?.phone || titular?.phone || null,
          };
        })
      );
      if (
        withContact.length &&
        parseCompletenessScore(withContact, expected) >=
          parseCompletenessScore(regex, expected)
      ) {
        return {
          passengers: sortPassengersAdultChildInfant(
            collapseDuplicatePassengers(withContact),
            opts?.travelDate
          ),
          source: "openai",
        };
      }
    }
  } catch {
    // ignora — fica no regex
  }

  return { passengers: regex, source: "regex" };
}
