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

/** Query Gmail preferida: assuntos típicos do programa (OR). */
export function verificationSubjectQuery(program: "LATAM" | "SMILES"): string {
  const subjects = verificationSubjectsForProgram(program);
  if (subjects.length === 1) return subjects[0];
  return subjects.map((s) => `"${s}"`).join(" OR ");
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

/**
 * Extrai candidatos a OTP (4–8 dígitos). Prefere 6 dígitos e códigos
 * próximos às palavras "código" / "code".
 */
export function extractVerificationCodes(raw: string): string[] {
  const text = stripHtml(raw);
  if (!text) return [];

  const lower = text.toLowerCase();
  const scored = new Map<string, number>();

  const re = /\b(\d{4,8})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const code = match[1];
    const n = Number(code);
    // Descarta anos óbvios e sequências fracas.
    if (n >= 1900 && n <= 2100 && code.length === 4) continue;
    if (/^0+$/.test(code) || /^1+$/.test(code)) continue;

    let score = code.length === 6 ? 10 : code.length === 5 || code.length === 7 ? 6 : 3;
    const idx = lower.indexOf(code.toLowerCase());
    if (idx >= 0) {
      const window = lower.slice(Math.max(0, idx - 40), idx + code.length + 40);
      if (/c[oó]digo|code|verifica|otp|token|senha/.test(window)) score += 8;
    }
    scored.set(code, Math.max(scored.get(code) || 0, score));
  }

  return Array.from(scored.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([code]) => code);
}

export function pickBestVerificationCode(raw: string): string | null {
  return extractVerificationCodes(raw)[0] || null;
}
