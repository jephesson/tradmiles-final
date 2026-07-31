// lib/gmail/otp.ts
// Extração de códigos de verificação de e-mails de fidelidade.

const SUBJECT_BY_PROGRAM: Record<"LATAM" | "SMILES", string[]> = {
  LATAM: ["código de verificação", "codigo de verificacao", "verification code"],
  SMILES: ["código de verificação", "codigo de verificacao", "código", "verification"],
};

export function verificationSubjectsForProgram(
  program: "LATAM" | "SMILES"
): string[] {
  return SUBJECT_BY_PROGRAM[program] || SUBJECT_BY_PROGRAM.LATAM;
}

/** Query Gmail preferida: assunto típico do programa. */
export function verificationSubjectQuery(program: "LATAM" | "SMILES"): string {
  if (program === "SMILES") return "código";
  return "Código de verificação";
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
