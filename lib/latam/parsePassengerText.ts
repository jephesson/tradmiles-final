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

/** Linha "Nome: …" / "Sobrenome: …" / etc. */
const LABELED_LINE_RE =
  /^\s*(nome|sobrenome|primeiro\s*nome|ultimo\s*nome|último\s*nome|documento|cpf|rg|data(?:\s+de)?\s*nascimento|nascimento|dn|e-?mail|email|telefone|celular|fone|whatsapp|sexo|genero|gênero)\s*(?:\([^)]*\))?\s*[:\-–]\s*(.+)\s*$/i;

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
    "worlei",
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
    "laura",
    "flavia",
  ]);

  if (female.has(first)) return "F";
  if (male.has(first)) return "M";
  if (first.endsWith("a")) return "F";
  if (first.endsWith("o")) return "M";
  return null;
}

function normKey(k: string) {
  return k
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLabeledBlock(block: string): ParsedPassenger | null {
  const lines = block
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let labeledHits = 0;
  let firstName = "";
  let lastName = "";
  let birthDate: string | null = null;
  let cpf: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;
  let gender: "M" | "F" | null = null;

  for (const line of lines) {
    const m = line.match(LABELED_LINE_RE);
    if (!m) continue;
    labeledHits++;
    const key = normKey(m[1]);
    const val = m[2].trim();

    if (key === "nome" || key === "primeiro nome") {
      // "Nome: WORLEI Babêto" — pode vir nome composto no campo Nome
      firstName = sanitizeLatamName(val);
      continue;
    }
    if (
      key === "sobrenome" ||
      key === "ultimo nome" ||
      key === "último nome"
    ) {
      lastName = sanitizeLatamName(val);
      continue;
    }
    if (
      key === "documento" ||
      key === "cpf" ||
      key === "rg"
    ) {
      const cpfM = val.match(CPF_RE);
      if (cpfM) {
        const digits = onlyDigits(cpfM[1]);
        if (digits.length === 11) cpf = digits;
      }
      continue;
    }
    if (
      key.includes("nascimento") ||
      key === "dn"
    ) {
      const dateM = val.match(DATE_RE);
      if (dateM) birthDate = toISODate(dateM[1], dateM[2], dateM[3]);
      continue;
    }
    if (key === "email" || key === "e-mail") {
      const emailM = val.match(EMAIL_RE);
      if (emailM) email = emailM[0].toLowerCase();
      continue;
    }
    if (
      key === "telefone" ||
      key === "celular" ||
      key === "fone" ||
      key === "whatsapp"
    ) {
      const phoneM = val.match(PHONE_RE) || val.match(/\d{8,}/);
      if (phoneM) phone = onlyDigits(phoneM[0]).replace(/^55/, "");
      continue;
    }
    if (key === "sexo" || key === "genero" || key === "gênero") {
      const g = val.toLowerCase();
      if (/^f|fem/.test(g)) gender = "F";
      else if (/^m|masc/.test(g)) gender = "M";
      continue;
    }
  }

  if (labeledHits < 1) return null;

  // Se "Nome" veio com mais de uma palavra e não há sobrenome, separa
  if (firstName && !lastName) {
    const parts = firstName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }

  if (!firstName && !lastName && !cpf) return null;

  return {
    firstName,
    lastName: lastName || firstName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf,
    email,
    phone,
    gender: gender || guessGender(firstName),
    raw: block.trim(),
  };
}

function parseFreeformBlock(block: string): ParsedPassenger | null {
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
    // Ignora linhas só de rótulo sem valor útil no freeform
    if (LABELED_LINE_RE.test(line)) continue;

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

function parseBlock(block: string): ParsedPassenger | null {
  const labeled = parseLabeledBlock(block);
  if (labeled && (labeled.firstName || labeled.cpf)) return labeled;
  return parseFreeformBlock(block);
}

function splitIntoBlocks(text: string): string[] {
  let blocks = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);

  // Vários passageiros com "Nome:" no mesmo bloco
  const byNomeLabel: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let cur: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const startsNome = /^\s*nome\s*(?:\([^)]*\))?\s*[:\-–]/i.test(trimmed);
      if (startsNome && cur.length) {
        byNomeLabel.push(cur.join("\n"));
        cur = [trimmed];
      } else {
        cur.push(trimmed);
      }
    }
    if (cur.length) byNomeLabel.push(cur.join("\n"));
  }
  if (byNomeLabel.length > blocks.length) blocks = byNomeLabel;

  // Freeform: fatia a cada linha de nome seguida de dados
  if (blocks.length === 1 && !LABELED_LINE_RE.test(blocks[0].split("\n")[0] || "")) {
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
        !LABELED_LINE_RE.test(trimmed) &&
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

  return blocks;
}

/**
 * Aceita formatos livres e rotulados, ex.:
 * Nome: WORLEI Babêto
 * Sobrenome: Militão
 * Documento (CPF/RG): 116.604.897-76
 * Data Nascimento: 09/02/1988
 */
export function parsePassengerText(raw: string): ParsedPassenger[] {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return [];

  return splitIntoBlocks(text)
    .map(parseBlock)
    .filter((p): p is ParsedPassenger => Boolean(p && (p.firstName || p.cpf)));
}
