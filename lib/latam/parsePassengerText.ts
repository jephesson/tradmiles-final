export type ParsedPassenger = {
  firstName: string;
  lastName: string;
  birthDate: string | null; // YYYY-MM-DD
  birthDateBR: string | null; // DD/MM/YYYY
  /** Formato LATAM: dd-mm-aaaa */
  birthDateLatam: string | null;
  cpf: string | null;
  /** false = 11 dígitos mas checksum inválido (mantém o valor e avisa na UI) */
  cpfValid: boolean | null;
  email: string | null;
  phone: string | null;
  gender: "M" | "F" | null;
  raw: string;
};

const DATE_RE = /\b(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2,4})\b/;
/** Data colada: 02091974 ou 020972 */
const DATE_COMPACT_RE = /\b(\d{2})(\d{2})(\d{4}|\d{2})\b/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/** Celular BR com 9º dígito (DDD + 9 + 8) ou fixo (DDD + 8). */
const PHONE_CANDIDATE_RE =
  /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\d{4}|\d{4})[-\s]?\d{4}\b/;

const LABELED_LINE_RE =
  /^\s*(nome\s*completo|nome|sobrenome|primeiro\s*nome|ultimo\s*nome|último\s*nome|passageiro|pax|documento|doc|cpf\/?cnpj|cpf|cnpj|rg|data(?:\s+de)?\s*nasc(?:imento)?|dt\.?\s*nasc(?:imento)?|nascido\s*em|nascimento|nasc|dn|e-?mail|email|mail|telefone|celular|fone|zap|wpp|whatsapp|sexo|genero|gênero)\s*(?:\([^)]*\))?\s*[:\-–.=]?\s*(.+)\s*$/i;

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

/** Validação de dígitos verificadores do CPF. */
export function isValidCpf(raw: string | null | undefined): boolean {
  const cpf = onlyDigits(String(raw || ""));
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

/** Mantém 11 dígitos mesmo com checksum inválido (para avisar, não apagar). */
function extractCpfDigits(s: string | null | undefined): string | null {
  const d = onlyDigits(String(s || ""));
  return d.length === 11 ? d : null;
}

function withCpfMeta<T extends { cpf: string | null }>(
  p: T
): T & { cpfValid: boolean | null } {
  const cpf = extractCpfDigits(p.cpf);
  return {
    ...p,
    cpf,
    cpfValid: cpf ? isValidCpf(cpf) : null,
  };
}

/** Telefone BR: 10 (fixo) ou 11 (celular com 9). Remove 55. */
function normalizePhone(s: string | null | undefined): string | null {
  let d = onlyDigits(String(s || ""));
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  if (d.length === 11 && /^[1-9]\d9\d{8}$/.test(d)) return d;
  if (d.length === 10 && /^[1-9]\d[2-5]\d{7}$/.test(d)) return d;
  // Celular sem DDD (9 dígitos) — raro, mas aceita
  if (d.length === 9 && /^9\d{8}$/.test(d)) return d;
  return null;
}

/**
 * Classifica sequência de 10–11 dígitos: CPF válido vs telefone.
 * Se já temos CPF, outro número de 10–11 vira telefone.
 */
function classifyDigits(
  digits: string,
  opts: {
    alreadyHasCpf?: boolean;
    labeledAs?: "cpf" | "phone" | null;
    /** Já há nome no bloco → 11 dígitos inválidos preferem CPF (avisar) a telefone */
    preferCpf?: boolean;
  } = {}
): "cpf" | "phone" | null {
  const d = onlyDigits(digits);
  if (opts.labeledAs === "phone") {
    return normalizePhone(d) || d.length === 10 || d.length === 11
      ? "phone"
      : null;
  }
  // Rotulado como CPF: aceita 11 dígitos mesmo se checksum falhar
  if (opts.labeledAs === "cpf") {
    return d.length === 11 ? "cpf" : null;
  }

  if (isValidCpf(d)) {
    if (opts.alreadyHasCpf && normalizePhone(d)) return "phone";
    return "cpf";
  }
  // CPF inválido (11 dígitos) mas contexto de passageiro → manter como CPF
  if (d.length === 11 && opts.preferCpf && !opts.alreadyHasCpf) {
    return "cpf";
  }
  if (normalizePhone(d)) return "phone";
  if (d.length === 11 || d.length === 10) {
    if (opts.alreadyHasCpf) return "phone";
    if (d.length === 11 && d[2] === "9") return "phone";
    // 11 dígitos que não parecem celular → CPF inválido (avisar)
    if (d.length === 11) return "cpf";
  }
  return null;
}

function toISODate(d: string, m: string, y: string) {
  let year = Number(y);
  if (year < 100) year += year >= 30 ? 1900 : 2000;
  const month = String(Number(m)).padStart(2, "0");
  const day = String(Number(d)).padStart(2, "0");
  if (year < 1900 || year > 2100) return null;
  const mi = Number(month);
  const di = Number(day);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
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
    "ronaldo",
    "isaias",
    "jaci",
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

/** Extrai nome mesmo quando a linha mistura Nasc/CPF/data. */
function extractNameFromLine(line: string): string {
  let s = String(line || "");
  s = s.replace(/[*_~`]+/g, " ");
  s = s.replace(EMAIL_RE, " ");
  s = s.replace(DATE_RE, " ");
  s = s.replace(DATE_COMPACT_RE, " ");
  s = s.replace(
    /\b(nome\s*completo|passageiro|pax|nascido\s*em|nasc(?:imento)?|dt\.?\s*nasc|dn|cpf\/?cnpj|cpf|c\.?p\.?f\.?|cnpj|rg|documento|doc|e-?mail|email|mail|tel(?:efone)?|cel(?:ular)?|whats?app?|zap|wpp|fone|sexo|genero)\b[:\s.=]*/gi,
    " "
  );
  s = s.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " ");
  s = s.replace(/\b\d{8,13}\b/g, " ");
  return sanitizeLatamName(s);
}

function parseDateFromText(s: string, { allowCompact = false } = {}): string | null {
  const dateM = s.match(DATE_RE);
  if (dateM) return toISODate(dateM[1], dateM[2], dateM[3]);
  const dig = onlyDigits(s);
  // Compacto: com rótulo de nasc, ou valor só com 8 dígitos (ddmmyyyy)
  const canCompact =
    allowCompact ||
    /\b(nasc|dn|nascimento|nascido)\b/i.test(s) ||
    /^\d{8}$/.test(dig);
  if (canCompact) {
    const compact = dig.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compact) return toISODate(compact[1], compact[2], compact[3]);
  }
  return null;
}

/** Normaliza texto de Zap: markdown, separadores, rótulos colados. */
function preprocessPassengerText(raw: string): string {
  let t = String(raw || "").replace(/\r/g, "");
  t = t.replace(/[*_~]{1,2}/g, "");
  // "Nome - João" / separadores comuns → quebra de linha
  t = t.replace(/\s*[|•·]\s*/g, "\n");
  t = t.replace(
    /\s+(?=(?:nome|sobrenome|cpf|cnpj|rg|nasc|nascimento|dn|email|e-mail|tel|fone|cel|whats|zap|doc(?:umento)?)\s*[:\-])/gi,
    "\n"
  );
  // "Nasc:02.09.1974" / "CPF:071..." sem espaço
  t = t.replace(
    /\b(cpf|cnpj|rg|nasc(?:imento)?|dn|email|tel|fone|cel)\s*[:\-.=]\s*/gi,
    (_, k) => `${k}: `
  );
  return t.trim();
}

function isContactOnlyBlock(block: string): boolean {
  const lines = block
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return true;
  let hasName = false;
  let hasContact = false;
  for (const line of lines) {
    const name = extractNameFromLine(line);
    if (name.split(/\s+/).filter(Boolean).length >= 2) hasName = true;
    if (EMAIL_RE.test(line)) hasContact = true;
    const dig = onlyDigits(line);
    if (dig.length >= 10 && dig.length <= 13) hasContact = true;
  }
  return hasContact && !hasName;
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

    if (
      key === "nome" ||
      key === "nome completo" ||
      key === "primeiro nome" ||
      key === "passageiro" ||
      key === "pax"
    ) {
      firstName = sanitizeLatamName(val);
      continue;
    }
    if (key === "sobrenome" || key === "ultimo nome" || key === "último nome") {
      lastName = sanitizeLatamName(val);
      continue;
    }
    if (
      key === "documento" ||
      key === "doc" ||
      key === "cpf" ||
      key === "cnpj" ||
      key === "cpf/cnpj" ||
      key === "rg"
    ) {
      const dig = onlyDigits(val);
      const kind = classifyDigits(dig, {
        labeledAs: "cpf",
        alreadyHasCpf: Boolean(cpf),
      });
      if (kind === "cpf") cpf = onlyDigits(dig).slice(0, 11);
      continue;
    }
    if (
      key.includes("nasc") ||
      key === "dn" ||
      key === "nascido em" ||
      key.startsWith("dt")
    ) {
      birthDate = parseDateFromText(val, { allowCompact: true }) || birthDate;
      continue;
    }
    if (key === "email" || key === "e-mail" || key === "mail") {
      const emailM = val.match(EMAIL_RE);
      if (emailM) email = emailM[0].toLowerCase();
      continue;
    }
    if (
      key === "telefone" ||
      key === "celular" ||
      key === "fone" ||
      key === "whatsapp" ||
      key === "zap" ||
      key === "wpp"
    ) {
      phone = normalizePhone(val) || onlyDigits(val).replace(/^55/, "") || null;
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

  if (firstName && !lastName) {
    const parts = firstName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(" ");
    }
  }

  if (!firstName && !lastName && !cpf) return null;

  return withCpfMeta({
    firstName,
    lastName: lastName || firstName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf: extractCpfDigits(cpf),
    email,
    phone,
    gender: gender || guessGender(firstName),
    raw: block.trim(),
  });
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
  const nameCandidates: string[] = [];

  for (const line of lines) {
    const nameEarly = extractNameFromLine(line);
    const tokens = nameEarly.split(/\s+/).filter(Boolean);
    if (
      tokens.length >= 2 ||
      (tokens.length === 1 && tokens[0].length >= 3)
    ) {
      nameCandidates.push(nameEarly);
    }
  }

  for (const line of lines) {
    const labeled = line.match(LABELED_LINE_RE);
    if (labeled) {
      // Reaproveita parser rotulado para a linha isolada
      const mini = parseLabeledBlock(line);
      if (mini) {
        if (mini.firstName && !nameCandidates.length) {
          nameCandidates.push(`${mini.firstName} ${mini.lastName}`.trim());
        }
        if (mini.birthDate && !birthDate) birthDate = mini.birthDate;
        if (mini.cpf && !cpf) cpf = mini.cpf;
        if (mini.email && !email) email = mini.email;
        if (mini.phone && !phone) phone = mini.phone;
      }
      continue;
    }

    const emailM = line.match(EMAIL_RE);
    if (emailM && !email) {
      email = emailM[0].toLowerCase();
    }

    if (!birthDate) {
      birthDate = parseDateFromText(line);
    }

    const labeledPhone = /\b(tel|cel|fone|whats|whatsapp|zap|wpp)\b/i.test(line);
    const labeledCpf = /\b(cpf|c\.?p\.?f\.?|documento|rg|doc)\b/i.test(line);

    // CPFs formatados / 11 dígitos — sem misturar com a data na mesma linha
    for (const dig of extractCpfCandidatesFromLine(line)) {
      const kind = classifyDigits(dig, {
        alreadyHasCpf: Boolean(cpf),
        labeledAs: labeledPhone ? "phone" : labeledCpf ? "cpf" : null,
        preferCpf: nameCandidates.length > 0 || labeledCpf,
      });
      if (kind === "cpf" && !cpf) cpf = dig;
      else if (kind === "phone" && !phone) {
        phone = normalizePhone(dig) || dig.replace(/^55/, "");
      }
    }

    // Telefone com máscara (não CPF)
    if (!phone && !labeledCpf) {
      const phoneM = line.match(PHONE_CANDIDATE_RE);
      if (phoneM) {
        const p = normalizePhone(phoneM[0]);
        if (p && !isValidCpf(p)) phone = p;
      }
    }
  }

  // nomes sem duplicar (já coletamos no 1º loop)
  const uniqueNames = [...new Set(nameCandidates)];
  nameCandidates.length = 0;
  nameCandidates.push(...uniqueNames);

  // Fallback: se sobrou só um número 11 dígitos e não classificamos
  if (!cpf && !phone) {
    const allDigits = onlyDigits(block);
    // não usar o bloco inteiro se misturar vários números
  }

  const fullName = nameCandidates[0] || "";
  // Bloco só de contato → não é passageiro
  if (!fullName && !cpf) {
    if (email || phone) return null;
    return null;
  }

  const { firstName, lastName } = splitName(fullName);

  return withCpfMeta({
    firstName,
    lastName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf: extractCpfDigits(cpf),
    email,
    phone,
    gender: guessGender(firstName),
    raw: block.trim(),
  });
}

function mergeParsed(
  a: ParsedPassenger | null,
  b: ParsedPassenger | null
): ParsedPassenger | null {
  if (!a) return b;
  if (!b) return a;
  const birthDate = a.birthDate || b.birthDate;
  const firstName = a.firstName || b.firstName;
  const lastName =
    a.lastName && a.lastName !== a.firstName
      ? a.lastName
      : b.lastName || a.lastName;
  return withCpfMeta({
    firstName,
    lastName: lastName || firstName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf: extractCpfDigits(a.cpf || b.cpf),
    email: a.email || b.email,
    phone: a.phone || b.phone,
    gender: a.gender || b.gender || guessGender(firstName),
    raw: a.raw || b.raw,
  });
}

function parseBlock(block: string): ParsedPassenger | null {
  // Rotulado sozinho falha em "Jaci... CPF 071..." (só a linha CPF é rotulada).
  // Sempre mescla com freeform para pegar nome/nasc na mesma mensagem.
  return mergeParsed(parseLabeledBlock(block), parseFreeformBlock(block));
}

/** Extrai e-mails/telefones soltos do texto inteiro (contato no fim do Zap). */
function extractFloatingContacts(text: string): {
  emails: string[];
  phones: string[];
} {
  const emails = Array.from(text.matchAll(new RegExp(EMAIL_RE.source, "gi"))).map(
    (m) => m[0].toLowerCase()
  );
  const phones: string[] = [];
  const chunks = text.match(/\d[\d.\-\s()]{7,}\d/g) || [];
  for (const chunk of chunks) {
    const dig = onlyDigits(chunk);
    if (DATE_RE.test(chunk) && onlyDigits(chunk).length <= 8) continue;
    const kind = classifyDigits(dig, { alreadyHasCpf: true });
    // alreadyHasCpf true força telefone quando não é CPF válido
    if (kind === "phone" || (!isValidCpf(dig) && normalizePhone(dig))) {
      const p = normalizePhone(dig) || dig.replace(/^55/, "");
      if (p && !phones.includes(p)) phones.push(p);
    } else if (!isValidCpf(dig) && (dig.length === 10 || dig.length === 11)) {
      const p = dig.replace(/^55/, "");
      if (!phones.includes(p)) phones.push(p);
    }
  }
  // Também tenta PHONE_CANDIDATE_RE
  for (const m of text.matchAll(new RegExp(PHONE_CANDIDATE_RE.source, "g"))) {
    const p = normalizePhone(m[0]);
    if (p && !phones.includes(p) && !isValidCpf(p)) phones.push(p);
  }
  return { emails: [...new Set(emails)], phones };
}

function lineLooksLikeName(trimmed: string): boolean {
  if (!trimmed || EMAIL_RE.test(trimmed)) return false;
  if (/^\s*(cpf|cnpj|email|e-mail|tel|cel|fone|zap|whats|nasc)/i.test(trimmed)) {
    // "CPF 861..." não é nome; "Camila Sales" sim
    if (/^\s*cpf\b/i.test(trimmed) && !/[A-Za-zÀ-ÿ]{3,}/.test(trimmed.replace(/cpf/i, ""))) {
      return false;
    }
    if (/^\s*(email|tel|cel|fone|zap|whats|nasc)/i.test(trimmed)) return false;
  }
  // Só data ou só CPF
  if (DATE_RE.test(trimmed) && !/[A-Za-zÀ-ÿ]{3,}/.test(trimmed)) return false;
  const dig = onlyDigits(trimmed);
  if (dig.length >= 10 && dig.length <= 11 && !/[A-Za-zÀ-ÿ]{3,}/.test(trimmed)) {
    return false;
  }
  const name = extractNameFromLine(trimmed);
  const tokens = name.split(/\s+/).filter(Boolean);
  return tokens.length >= 2 || (tokens.length === 1 && tokens[0].length >= 4);
}

function blockHasPaxData(lines: string[]): boolean {
  const text = lines.join("\n");
  if (DATE_RE.test(text)) return true;
  if (/\bcpf\b/i.test(text)) return true;
  // CPF formatado ou 11 dígitos em alguma linha
  for (const line of lines) {
    const dig = onlyDigits(line);
    if (dig.length === 11) return true;
    if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(line)) return true;
  }
  return false;
}

/** Fatia um bloco em vários pax sempre que achar novo nome. */
function splitBlockByNames(block: string): string[] {
  const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const rebuilt: string[] = [];
  let cur: string[] = [];

  for (const trimmed of lines) {
    const looksName = lineLooksLikeName(trimmed);
    if (looksName && cur.length && blockHasPaxData(cur)) {
      // Novo nome depois de data/CPF do anterior
      rebuilt.push(cur.join("\n"));
      cur = [trimmed];
      continue;
    }
    cur.push(trimmed);
  }
  if (cur.length) rebuilt.push(cur.join("\n"));
  return rebuilt.length ? rebuilt : [block];
}

/**
 * Formato colado numa linha / poucas linhas:
 * "Isabella Angelis 08/07/82 719.122.311-15 Ovidio Angelis 14/11/44 ..."
 */
function explodeDensePassengerLine(text: string): string | null {
  // Já bem estruturado em linhas → não remistura
  const lineCount = text.split(/\n/).filter((l) => l.trim()).length;
  if (lineCount >= 6) return null;

  const compact = text.replace(/\s+/g, " ").trim();
  const dates = [...compact.matchAll(new RegExp(DATE_RE.source, "g"))];
  const cpfs = [...compact.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)];
  if (dates.length < 2 && cpfs.length < 2) return null;

  let out = compact;
  // Nome + data → linhas separadas
  out = out.replace(
    /([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){1,5})\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g,
    "\n$1\n$2"
  );
  // Data + CPF → linhas separadas (evita blob 080782719…)
  out = out.replace(
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s+(CPF\s*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})/gi,
    "$1\n$2$3"
  );
  // Nome + CPF (sem data na frente)
  out = out.replace(
    /([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,}){1,5})\s+(CPF\s*)?(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})/gi,
    "\n$1\n$2$3"
  );
  // CPF + data (caso Camila)
  out = out.replace(
    /(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/g,
    "$1\n$2"
  );
  return out.includes("\n") ? out : null;
}

/** Extrai candidatos a CPF numa linha sem misturar com a data. */
function extractCpfCandidatesFromLine(line: string): string[] {
  const out: string[] = [];
  // Remove datas da linha antes de caçar CPF
  const withoutDates = line.replace(DATE_RE, " ");
  for (const m of withoutDates.matchAll(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g)) {
    out.push(onlyDigits(m[0]));
  }
  for (const m of withoutDates.matchAll(/\b\d{11}\b/g)) {
    out.push(m[0]);
  }
  return [...new Set(out.filter((d) => d.length === 11))];
}

function splitIntoBlocks(text: string): string[] {
  // Zap às vezes cola com \u2028 / espaços estranhos
  let normalized = text
    .replace(/\u2028|\u2029/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  const dense = explodeDensePassengerLine(normalized);
  if (dense) normalized = dense;

  // Une blocos que são só e-mail/telefone ao bloco anterior
  const raw = normalized.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const merged: string[] = [];
  for (const block of raw) {
    if (merged.length && isContactOnlyBlock(block)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${block}`;
      continue;
    }
    merged.push(block);
  }

  let blocks = merged.length ? merged : raw;

  // Vários "Nome:" no mesmo bloco
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

  // Sempre fatia por nome — inclusive quando já há 2+ blocos (bug: Zap cria 1 linha em branco no meio)
  const byNames: string[] = [];
  for (const block of blocks) {
    byNames.push(...splitBlockByNames(block));
  }
  if (byNames.length > blocks.length) blocks = byNames;
  else if (byNames.length === blocks.length && byNames.length > 0) {
    blocks = byNames;
  }

  return blocks.filter(Boolean);
}

export type TitularContact = {
  email?: string | null;
  phone?: string | null;
};

/**
 * Contato compartilhado:
 * 1) Se o texto trouxer 1 e-mail / 1 telefone → preenche em todos.
 * 2) Se não trouxer nenhum → usa e-mail/telefone do titular (cartão/funcionário).
 */
function applySharedContacts(
  passengers: ParsedPassenger[],
  text: string,
  titular?: TitularContact | null
): ParsedPassenger[] {
  if (!passengers.length) return passengers;
  const { emails, phones } = extractFloatingContacts(text);

  const usedCpfs = new Set(
    passengers.map((p) => p.cpf).filter(Boolean) as string[]
  );

  // Contato vindo do texto (solto ou já no 1º pax)
  const textEmail =
    emails[0] || passengers.find((p) => p.email)?.email || null;
  const textPhone =
    phones.find((ph) => !usedCpfs.has(ph)) ||
    passengers.find((p) => p.phone)?.phone ||
    null;

  const titularEmail = (titular?.email || "").trim() || null;
  const titularPhone =
    normalizePhone(titular?.phone) ||
    (() => {
      const d = onlyDigits(String(titular?.phone || ""));
      return d.length >= 10 ? d : null;
    })();

  return passengers.map((p) => {
    let email = p.email;
    let phone = p.phone;
    if (textEmail) email = textEmail;
    else if (!email && titularEmail) email = titularEmail;
    if (textPhone) phone = textPhone;
    else if (!phone && titularPhone) phone = titularPhone;
    return withCpfMeta({ ...p, email, phone });
  });
}

/**
 * Aceita formatos livres e rotulados. Ex. WhatsApp:
 * Jaci de Oliveira. Nasc 02.09.1974.
 * CPF 07157181770.
 *
 * isaiasbrunovooir@gmail.com
 * 97981039054
 *
 * @param titular Contato do titular do cartão/funcionário — usado só se o texto
 *                não trouxer e-mail/telefone.
 */
export function parsePassengerText(
  raw: string,
  titular?: TitularContact | null
): ParsedPassenger[] {
  const text = preprocessPassengerText(raw);
  if (!text) return [];

  const parsed = splitIntoBlocks(text)
    .map(parseBlock)
    .filter((p): p is ParsedPassenger =>
      Boolean(p && (p.firstName || extractCpfDigits(p.cpf)))
    )
    // Descarta bloco que é só telefone (11 dígitos inválidos sem nome)
    .filter((p) => {
      if (p.firstName) return true;
      if (p.cpf && p.cpfValid) return true;
      // CPF inválido sozinho sem nome → provavelmente telefone; descarta
      return false;
    })
    .map((p) => withCpfMeta(p));

  return applySharedContacts(parsed, text, titular);
}
