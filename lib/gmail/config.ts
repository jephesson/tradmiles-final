// lib/gmail/config.ts
// Configuração da caixa de entrada filtrada por programa.

export type EmailProgram = "SMILES" | "LATAM" | "LIVELO";

export const EMAIL_PROGRAMS: EmailProgram[] = ["SMILES", "LATAM", "LIVELO"];

export const PROGRAM_LABEL: Record<EmailProgram, string> = {
  SMILES: "Smiles",
  LATAM: "LATAM",
  LIVELO: "Livelo",
};

/**
 * Domínios remetentes de cada programa. O match é por sufixo, então
 * "smiles.com.br" também cobre "mail.smiles.com.br".
 */
export const PROGRAM_DOMAINS: Record<EmailProgram, string[]> = {
  SMILES: ["smiles.com.br", "voegol.com.br", "gol.com.br"],
  LATAM: ["latam.com", "latamairlines.com", "latampass.com"],
  LIVELO: ["livelo.com.br", "pontoslivelo.com.br"],
};

/** Janela padrão de busca no Gmail. Evita varrer a caixa inteira. */
export const DEFAULT_WINDOW_DAYS = 180;

/** Quantidade de mensagens por página. */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;

/** Cabeçalhos que carregam o destinatário original de uma mensagem encaminhada. */
export const RECIPIENT_HEADERS = [
  "To",
  "Cc",
  "Delivered-To",
  "X-Forwarded-To",
  "X-Forwarded-For",
  "X-Original-To",
  "Envelope-To",
];

export const METADATA_HEADERS = ["From", "Subject", "Date", ...RECIPIENT_HEADERS];

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^\.+/, "");
}

/** Descobre o programa a partir do domínio do remetente. */
export function programFromSender(fromAddress: string): EmailProgram | null {
  const at = fromAddress.lastIndexOf("@");
  if (at === -1) return null;

  const domain = normalizeDomain(fromAddress.slice(at + 1));
  if (!domain) return null;

  for (const program of EMAIL_PROGRAMS) {
    for (const candidate of PROGRAM_DOMAINS[program]) {
      const d = normalizeDomain(candidate);
      if (domain === d || domain.endsWith(`.${d}`)) return program;
    }
  }

  return null;
}

/**
 * Monta a parte `from:` da query do Gmail. Quando nenhum programa é
 * informado, considera todos os programas conhecidos.
 */
export function buildSenderQuery(programs: EmailProgram[]): string {
  const list = programs.length ? programs : EMAIL_PROGRAMS;
  const domains = Array.from(new Set(list.flatMap((p) => PROGRAM_DOMAINS[p])));
  if (!domains.length) return "";
  return `from:(${domains.join(" OR ")})`;
}

/** Onde aplicar o termo de busca na query do Gmail. */
export type EmailSearchIn = "subject" | "anywhere";

/**
 * Monta o trecho de busca por texto.
 * - subject: só no título (ex.: código da reserva)
 * - anywhere: assunto + corpo (palavras/trechos do e-mail)
 *
 * Se o usuário já digitar operadores do Gmail (subject:, from:, etc.),
 * o termo é passado direto.
 */
export function buildContentQuery(raw: string, searchIn: EmailSearchIn = "anywhere"): string {
  const term = raw.trim();
  if (!term) return "";

  // Operadores avançados: não reescreve.
  if (/\b(subject|from|to|cc|bcc|has|label|is|filename|newer_than|older_than|deliveredto):/i.test(term)) {
    return `(${term})`;
  }

  const cleaned = term.replace(/"/g, "").trim();
  if (!cleaned) return "";

  const atom = /\s/.test(cleaned) || /[()]/.test(cleaned) ? `"${cleaned}"` : cleaned;

  if (searchIn === "subject") return `subject:(${atom})`;
  return `(${atom})`;
}
