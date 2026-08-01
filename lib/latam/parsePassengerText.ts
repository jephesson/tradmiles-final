export type ParsedPassenger = {
  firstName: string;
  lastName: string;
  birthDate: string | null; // YYYY-MM-DD
  birthDateBR: string | null; // DD/MM/YYYY
  /** Formato LATAM: dd-mm-aaaa */
  birthDateLatam: string | null;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  gender: "M" | "F" | null;
  raw: string;
};

const DATE_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;
const CPF_RE = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})\b/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-\s]?\d{4}\b/;

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function toISODate(d: string, m: string, y: string) {
  let year = Number(y);
  if (year < 100) year += 2000;
  const month = String(Number(m)).padStart(2, "0");
  const day = String(Number(d)).padStart(2, "0");
  if (year < 1900 || year > 2100) return null;
  return `${year}-${month}-${day}`;
}

function toBRDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

function toLatamDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return null;
  return `${d}-${m}-${y}`;
}

/** LATAM rejeita acento/caracteres especiais no nome. */
function sanitizeLatamName(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitName(full: string) {
  const parts = sanitizeLatamName(full).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  // 1º token = nome; resto = sobrenome
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/** Heurística simples pelo 1º nome (PT-BR) — só para pré-preencher sexo na LATAM. */
export function guessGender(name: string): "M" | "F" | null {
  const first = sanitizeLatamName(name).split(/\s+/)[0]?.toLowerCase() || "";
  if (!first) return null;

  const male = new Set([
    "jose",
    "jorge",
    "andre",
    "lucas",
    "matheus",
    "mateus",
    "nicolas",
    "nicholas",
    "luca",
    "noah",
    "davi",
    "david",
    "gabriel",
    "rafael",
    "miguel",
    "samuel",
    "daniel",
    "henrique",
    "felipe",
    "guilherme",
    "alexandre",
    "kaique",
    "caique",
    "isaac",
    "isac",
    "moises",
    "juan",
    "luan",
    "bryan",
    "ryan",
    "ian",
    "enzo",
    "lorenzo",
    "theo",
    "heitor",
    "arthur",
    "artur",
    "victor",
    "vitor",
    "pedro",
    "paulo",
    "carlos",
    "marcos",
    "luis",
    "luiz",
    "bruno",
    "diego",
    "tiago",
    "thiago",
    "igor",
    "kevin",
    "erick",
    "eric",
    "joao",
    "wellington",
    "washington",
    "nicholas",
  ]);
  const female = new Set([
    "alice",
    "beatriz",
    "raquel",
    "isabel",
    "isabelle",
    "carmen",
    "ingrid",
    "lais",
    "nicole",
    "michele",
    "michelle",
    "irene",
    "ivone",
    "elis",
    "heloise",
    "louise",
    "jennifer",
    "kelly",
    "yasmin",
    "iasmin",
    "milene",
    "gisele",
    "giselle",
    "sheila",
    "debora",
    "deborah",
    "ester",
    "esther",
    "ruth",
    "rayssa",
    "raissa",
    "ingrid",
    "laura",
    "flavia",
    "flavia",
  ]);

  if (female.has(first)) return "F";
  if (male.has(first)) return "M";
  if (first.endsWith("a")) return "F";
  if (first.endsWith("o")) return "M";
  return null;
}

function parseBlock(block: string): ParsedPassenger | null {
  const lines = block
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  let birthDate: string | null = null;
  let cpf: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  const nameLines: string[] = [];

  for (const line of lines) {
    const dateM = line.match(DATE_RE);
    if (dateM && !birthDate) {
      birthDate = toISODate(dateM[1], dateM[2], dateM[3]);
      continue;
    }
    const emailM = line.match(EMAIL_RE);
    if (emailM && !email) {
      email = emailM[0].toLowerCase();
      continue;
    }
    const cpfM = line.match(CPF_RE);
    if (cpfM && !cpf) {
      const digits = onlyDigits(cpfM[1]);
      if (digits.length === 11) {
        cpf = digits;
        continue;
      }
    }
    const phoneM = line.match(PHONE_RE);
    if (phoneM && !phone) {
      phone = onlyDigits(phoneM[0]).replace(/^55/, "");
      continue;
    }
    // linha de nome: tem letras e pouca “cara” de dado
    if (/[A-Za-zÀ-ÿ]{2,}/.test(line) && !EMAIL_RE.test(line)) {
      nameLines.push(line.replace(/\s+/g, " ").trim());
    }
  }

  const fullName = nameLines[0] || "";
  if (!fullName && !cpf && !email) return null;
  const { firstName, lastName } = splitName(fullName);

  return {
    firstName,
    lastName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf,
    email,
    phone,
    gender: guessGender(firstName),
    raw: block.trim(),
  };
}

/**
 * Separa blocos por linha em branco ou por padrão “novo nome + data”.
 */
export function parsePassengerText(raw: string): ParsedPassenger[] {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return [];

  let blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);

  // Se veio tudo em um bloco, tenta fatiar a cada linha de nome seguida de data
  if (blocks.length === 1) {
    const lines = text.split("\n");
    const rebuilt: string[] = [];
    let cur: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const looksName =
        /[A-Za-zÀ-ÿ]{2,}/.test(trimmed) &&
        !DATE_RE.test(trimmed) &&
        !EMAIL_RE.test(trimmed) &&
        !CPF_RE.test(trimmed) &&
        onlyDigits(trimmed).length < 10;
      if (looksName && cur.length) {
        rebuilt.push(cur.join("\n"));
        cur = [trimmed];
      } else {
        cur.push(trimmed);
      }
    }
    if (cur.length) rebuilt.push(cur.join("\n"));
    if (rebuilt.length > 1) blocks = rebuilt;
  }

  return blocks
    .map(parseBlock)
    .filter((p): p is ParsedPassenger => Boolean(p && (p.firstName || p.cpf)));
}
