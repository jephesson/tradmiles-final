// lib/gmail/otp.ts
// Extração de códigos de verificação de e-mails de fidelidade.

/**
 * Folga ao buscar código: puxa e-mails dos últimos N min.
 * Antes era 3 min e o código sumia se o modal abrisse um pouco tarde.
 */
export const OTP_LOOKBACK_MS = 15 * 60 * 1000;

/**
 * Validade do código a partir da hora de chegada do e-mail.
 * Smiles: "Esse código é válido por 5 minutos."
 */
export const OTP_VALIDITY_MS: Record<"LATAM" | "SMILES", number> = {
  LATAM: 5 * 60 * 1000,
  SMILES: 5 * 60 * 1000,
};

const SUBJECT_BY_PROGRAM: Record<"LATAM" | "SMILES", string[]> = {
  LATAM: ["código de verificação", "codigo de verificacao", "verification code"],
  // Biblioteca "Código Smiles" — assunto real do e-mail da Gol/Smiles
  SMILES: [
    "aqui está seu código de acesso",
    "aqui esta seu codigo de acesso",
    "código de acesso",
    "codigo de acesso",
    "código de verificação",
    "codigo de verificacao",
  ],
};

export function verificationSubjectsForProgram(
  program: "LATAM" | "SMILES"
): string[] {
  return SUBJECT_BY_PROGRAM[program] || SUBJECT_BY_PROGRAM.LATAM;
}

/** Query Gmail por assunto(s) do programa — já com operador subject:. */
export function verificationSubjectQuery(program: "LATAM" | "SMILES"): string {
  const subjects = verificationSubjectsForProgram(program);
  if (!subjects.length) return "";
  if (subjects.length === 1) return `subject:"${subjects[0]}"`;
  // NÃO passar por buildContentQuery: ele tira as aspas e vira uma frase só.
  return `subject:(${subjects.map((s) => `"${s}"`).join(" OR ")})`;
}

/** Termos extras para ENC/Fwd (assunto pode vir "ENC: Aqui está…"). */
export function verificationForwardSubjectQuery(
  program: "LATAM" | "SMILES"
): string {
  if (program === "SMILES") {
    return (
      'subject:("Aqui está seu código de acesso" OR "código de acesso" OR ' +
      "código OR codigo OR verification OR ENC OR Fwd OR Fw: OR Encaminh)"
    );
  }
  return (
    "(subject:código OR subject:codigo OR subject:verification OR " +
    "subject:ENC OR subject:Fwd OR subject:Fw: OR subject:Encaminh)"
  );
}

/** ms restantes até expirar (0 se já expirou). */
export function otpRemainingMs(
  arrivedIso: string | null | undefined,
  program: "LATAM" | "SMILES",
  nowMs = Date.now()
): number | null {
  if (!arrivedIso) return null;
  const arrived = new Date(arrivedIso).getTime();
  if (!Number.isFinite(arrived)) return null;
  const expires = arrived + OTP_VALIDITY_MS[program];
  return Math.max(0, expires - nowMs);
}

export function formatOtpCountdown(remainingMs: number): string {
  const totalSec = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function stripHtml(input: string) {
  return String(input || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasOtpKeywordNear(code: string, lowerContext: string) {
  const idx = lowerContext.indexOf(code.toLowerCase());
  if (idx < 0) return false;
  const window = lowerContext.slice(Math.max(0, idx - 48), idx + code.length + 48);
  return /c[oó]digo|code|verifica|otp|token|senha|login|acesso/.test(window);
}

function scoreOtpCandidate(
  code: string,
  lowerContext: string,
  bonus = 0
): number {
  if (code.length !== 6) return -1;
  const n = Number(code);
  if (!Number.isFinite(n)) return -1;
  if (/^0+$/.test(code) || /^1+$/.test(code)) return -1;
  // 202601…202612 e similares não são OTP
  if (/^20\d{4}$/.test(code)) {
    const mm = Number(code.slice(4, 6));
    if (mm >= 1 && mm <= 12) return -1;
  }

  let score = 1 + bonus;
  if (hasOtpKeywordNear(code, lowerContext)) score += 8;
  // Sem padrão explícito (alt / "seu código") nem palavra perto, ignora número solto.
  if (bonus < 12 && score < 8) return -1;
  return score;
}

/**
 * Extrai só OTP de 6 dígitos (LATAM e Smiles). Ignora CEP, hora, ID, etc.
 * LATAM às vezes põe o código em imagem (alt) ou com espaços (1 2 3 4 5 6).
 */
export function extractVerificationCodes(raw: string): string[] {
  const rawStr = String(raw || "");
  if (!rawStr.trim()) return [];

  const scored = new Map<string, number>();
  const consider = (code: string, context: string, bonus = 0) => {
    const digits = String(code || "").replace(/\D/g, "");
    if (digits.length !== 6) return;
    const score = scoreOtpCandidate(digits, context.toLowerCase(), bonus);
    if (score < 0) return;
    scored.set(digits, Math.max(scored.get(digits) || 0, score));
  };

  // alt/title/aria-label em img/td (código em imagem da LATAM)
  const attrRe =
    /<(?:img|td|span|div|strong|b)[^>]*\b(?:alt|title|aria-label)=["'](\d{6})["'][^>]*>/gi;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRe.exec(rawStr))) {
    consider(attrMatch[1], rawStr, 14);
  }

  const text = stripHtml(rawStr);

  const explicit = [
    /c[oó]digo\s+de\s+verifica[cç][aã]o[^0-9]{0,40}(\d{6})/gi,
    /c[oó]digo\s+de\s+acesso[^0-9]{0,40}(\d{6})/gi,
    /fazer\s+login\s+[eé]\s*(\d{6})/gi,
    /verifica[cç][aã]o\s+para\s+fazer\s+login\s+[eé]\s*(\d{6})/gi,
    /seu\s+c[oó]digo[^0-9]{0,40}(\d{6})/gi,
    /(?:código|codigo|code)[^0-9]{0,24}(\d{6})/gi,
  ];
  for (const re of explicit) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      consider(m[1], text, 16);
    }
  }

  // Dígitos espaçados: "1 2 3 4 5 6" ou "12 34 56"
  const spacedRe = /\b(?:\d(?:\s+|-)){5}\d\b|\b\d{2}(?:\s+|-)\d{2}(?:\s+|-)\d{2}\b/g;
  let spaced: RegExpExecArray | null;
  while ((spaced = spacedRe.exec(text))) {
    consider(spaced[0], text, 12);
  }

  return Array.from(scored.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
}

export function pickBestVerificationCode(raw: string): string | null {
  return extractVerificationCodes(raw)[0] || null;
}

/**
 * Chips/alertas de OTP: usa a mesma query robusta do modal de credenciais.
 * Evita query fraca ("código de verificação") no Smiles e OR quebrado.
 */
export function resolveOtpFilterGmailQuery(input: {
  name?: string;
  query: string;
  program: string;
}): string | null {
  const name = String(input.name || "").toLowerCase();
  const query = String(input.query || "").toLowerCase();
  const program = String(input.program || "").toUpperCase();
  const blob = `${name} ${query}`;

  const looksOtp =
    /c[oó]digo/.test(blob) ||
    /verifica/.test(blob) ||
    /acesso/.test(blob) ||
    /otp/.test(blob);

  if (!looksOtp) return null;

  if (program === "SMILES" || /\bsmiles\b|\bgol\b/.test(blob)) {
    return verificationSubjectQuery("SMILES");
  }
  if (program === "LATAM" || /\blatam\b/.test(blob)) {
    return verificationSubjectQuery("LATAM");
  }
  // Sem programa: cobre LATAM + Smiles
  return `(${verificationSubjectQuery("LATAM")} OR ${verificationSubjectQuery("SMILES")})`;
}
