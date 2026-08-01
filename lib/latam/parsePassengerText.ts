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

function normalizeCpf(s: string | null | undefined): string | null {
  const d = onlyDigits(String(s || ""));
  if (d.length !== 11) return null;
  return isValidCpf(d) ? d : null;
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
  opts: { alreadyHasCpf?: boolean; labeledAs?: "cpf" | "phone" | null } = {}
): "cpf" | "phone" | null {
  const d = onlyDigits(digits);
  if (opts.labeledAs === "phone") {
    return normalizePhone(d) || d.length === 10 || d.length === 11 ? "phone" : null;
  }
  // Rotulado como CPF: aceita 11 dígitos mesmo se checksum falhar
  if (opts.labeledAs === "cpf") {
    return d.length === 11 ? "cpf" : null;
  }

  if (isValidCpf(d)) {
    // CPF válido que também parece celular: se já há CPF, trata como phone
    if (opts.alreadyHasCpf && normalizePhone(d)) return "phone";
    return "cpf";
  }
  if (normalizePhone(d)) return "phone";
  // 11 dígitos inválidos como CPF: quase sempre telefone no chat
  if (d.length === 11 || d.length === 10) {
    if (opts.alreadyHasCpf) return "phone";
    // Prefere telefone se começa com DDD + 9
    if (d.length === 11 && d[2] === "9") return "phone";
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

  return {
    firstName,
    lastName: lastName || firstName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf: cpf && isValidCpf(cpf) ? cpf : cpf,
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
  const nameCandidates: string[] = [];

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
    const dateM = line.match(DATE_RE);

    // Todos os grupos de dígitos longos na linha
    const digitChunks = line.match(/\d[\d.\-\s()]{7,}\d/g) || [];
    for (const chunk of digitChunks) {
      const dig = onlyDigits(chunk);
      if (dig.length < 10 || dig.length > 13) continue;
      // Pula se for a data já capturada
      if (dateM && onlyDigits(`${dateM[1]}${dateM[2]}${dateM[3]}`) === dig) {
        continue;
      }
      const labeledPhone = /\b(tel|cel|fone|whats|whatsapp)\b/i.test(line);
      const labeledCpf = /\b(cpf|c\.?p\.?f\.?|documento|rg)\b/i.test(line);
      const kind = classifyDigits(dig, {
        alreadyHasCpf: Boolean(cpf),
        labeledAs: labeledPhone ? "phone" : labeledCpf ? "cpf" : null,
      });
      if (kind === "cpf" && !cpf) cpf = onlyDigits(dig).slice(-11);
      else if (kind === "phone" && !phone) {
        phone = normalizePhone(dig) || onlyDigits(dig).replace(/^55/, "");
      }
    }

    const name = extractNameFromLine(line);
    if (name && /[A-Za-z]{2,}/.test(name)) {
      // Exige pelo menos 2 tokens OU 1 token se for a única linha com letras
      const tokens = name.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2 || (tokens.length === 1 && tokens[0].length >= 3)) {
        nameCandidates.push(name);
      }
    }
  }

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
  return {
    firstName,
    lastName: lastName || firstName,
    birthDate,
    birthDateBR: toBRDate(birthDate),
    birthDateLatam: toLatamDate(birthDate),
    cpf: a.cpf || b.cpf,
    email: a.email || b.email,
    phone: a.phone || b.phone,
    gender: a.gender || b.gender || guessGender(firstName),
    raw: a.raw || b.raw,
  };
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

function splitIntoBlocks(text: string): string[] {
  // Une blocos que são só e-mail/telefone ao bloco anterior
  const raw = text.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
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

  // Freeform: novo passageiro só quando aparece outro NOME (não e-mail/fone)
  if (blocks.length === 1) {
    const lines = blocks[0].split("\n");
    const rebuilt: string[] = [];
    let cur: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const name = extractNameFromLine(trimmed);
      const tokens = name.split(/\s+/).filter(Boolean);
      const looksName =
        tokens.length >= 2 &&
        !EMAIL_RE.test(trimmed) &&
        !/^\s*(cpf|email|tel|cel|fone|nasc)/i.test(trimmed);
      if (looksName && cur.length && cur.some((l) => extractNameFromLine(l))) {
        // Só fatia se o bloco atual já tem CPF ou data (passageiro "completo")
        const curText = cur.join("\n");
        const curHasData =
          DATE_RE.test(curText) ||
          /\b\d{11}\b/.test(onlyDigits(curText)) ||
          /\bcpf\b/i.test(curText);
        if (curHasData) {
          rebuilt.push(cur.join("\n"));
          cur = [trimmed];
          continue;
        }
      }
      cur.push(trimmed);
    }
    if (cur.length) rebuilt.push(cur.join("\n"));
    if (rebuilt.length > 1) blocks = rebuilt;
  }

  return blocks;
}

function attachFloatingContacts(
  passengers: ParsedPassenger[],
  text: string
): ParsedPassenger[] {
  if (!passengers.length) return passengers;
  const { emails, phones } = extractFloatingContacts(text);

  // CPFs já usados não são telefone
  const usedCpfs = new Set(
    passengers.map((p) => p.cpf).filter(Boolean) as string[]
  );

  const freeEmails = emails.filter(
    (e) => !passengers.some((p) => p.email === e)
  );
  const freePhones = phones.filter(
    (p) => !usedCpfs.has(p) && !passengers.some((x) => x.phone === p)
  );

  // Contato no fim do Zap → 1º passageiro (comprador / contato)
  const first = { ...passengers[0] };
  if (!first.email && freeEmails[0]) first.email = freeEmails[0];
  if (!first.phone && freePhones[0]) first.phone = freePhones[0];
  return [first, ...passengers.slice(1)];
}

/**
 * Aceita formatos livres e rotulados. Ex. WhatsApp:
 * Jaci de Oliveira. Nasc 02.09.1974.
 * CPF 07157181770.
 *
 * isaiasbrunovooir@gmail.com
 * 97981039054
 */
export function parsePassengerText(raw: string): ParsedPassenger[] {
  const text = preprocessPassengerText(raw);
  if (!text) return [];

  const parsed = splitIntoBlocks(text)
    .map(parseBlock)
    .filter((p): p is ParsedPassenger =>
      Boolean(p && (p.firstName || (p.cpf && isValidCpf(p.cpf))))
    )
    // Descarta "passageiro" que é só telefone disfarçado de CPF
    .filter((p) => {
      if (p.firstName) return true;
      if (p.cpf && isValidCpf(p.cpf)) return true;
      return false;
    });

  return attachFloatingContacts(parsed, text);
}
