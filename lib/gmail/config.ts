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
  LATAM: [
    "latam.com",
    "latam.com.br",
    "latamairlines.com",
    "latamairlines.com.br",
    "latampass.com",
    "latampass.com.br",
  ],
  LIVELO: [
    "livelo.com.br",
    "pontoslivelo.com.br",
    "infolivelo.com",
    "mail.infolivelo.com",
  ],
};

/**
 * Tokens extras no `from:` do Gmail (nome/local-part). Pegam ESP/Salesforce
 * cujo domínio não é o da cia, mas o remetente carrega "LATAM"/"Smiles"/etc.
 */
export const PROGRAM_FROM_TOKENS: Record<EmailProgram, string[]> = {
  SMILES: ["smiles", "voegol", "gol", `"Gol Smiles"`, `"GOL"`],
  LATAM: ["latam", "latampass", `"LATAM Airlines"`, `"LATAM Pass"`, `"Clube LATAM"`],
  LIVELO: ["livelo", `"Pontos Livelo"`, `"Info Livelo"`, "infolivelo"],
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

/** Fallback por nome do remetente / assunto quando o domínio não é da cia. */
export function programFromHints(
  fromAddress: string,
  fromName = "",
  subject = ""
): EmailProgram | null {
  const byDomain = programFromSender(fromAddress);
  if (byDomain) return byDomain;

  const hay = `${fromName} ${fromAddress} ${subject}`.toLowerCase();
  if (/\blatam\b/.test(hay) || /latam\s*pass/.test(hay)) return "LATAM";
  if (/\bsmiles\b/.test(hay) || /\bvoegol\b/.test(hay) || /\bgol\b/.test(hay))
    return "SMILES";
  if (/\blivelo\b/.test(hay)) return "LIVELO";
  return null;
}

/**
 * Monta a parte `from:` da query do Gmail. Quando nenhum programa é
 * informado, considera todos os programas conhecidos.
 */
export function buildSenderQuery(programs: EmailProgram[]): string {
  const list = programs.length ? programs : EMAIL_PROGRAMS;
  const domains = Array.from(new Set(list.flatMap((p) => PROGRAM_DOMAINS[p])));
  const tokens = Array.from(new Set(list.flatMap((p) => PROGRAM_FROM_TOKENS[p])));
  const parts = [...domains, ...tokens];
  if (!parts.length) return "";
  return `from:(${parts.join(" OR ")})`;
}

/**
 * Encaminhamentos manuais (Fwd/Enc): o From vira o cedente, não a cia.
 * Pega assunto de forward + menção ao programa (assunto/corpo).
 */
export function buildManualForwardQuery(programs: EmailProgram[]): string {
  const list = programs.length ? programs : EMAIL_PROGRAMS;
  const tokens = Array.from(new Set(list.flatMap((p) => PROGRAM_FROM_TOKENS[p])));
  if (!tokens.length) return "";
  return `((subject:Fwd OR subject:Fw: OR subject:Enc OR subject:Encaminh) (${tokens.join(" OR ")}))`;
}

/** Remetentes das cias OU encaminhamentos manuais sobre elas. */
export function buildInboxProgramQuery(programs: EmailProgram[]): string {
  const sender = buildSenderQuery(programs);
  const fwd = buildManualForwardQuery(programs);
  if (sender && fwd) return `(${sender} OR ${fwd})`;
  return sender || fwd;
}

/**
 * E-mails envolvendo endereços de cedentes cadastrados (from/to/cc/deliveredto).
 * Em lotes para não estourar o limite de tamanho da query do Gmail.
 */
export function buildCedenteAddressQueries(
  emails: string[],
  opts?: { batchSize?: number; maxBatches?: number }
): string[] {
  const batchSize = opts?.batchSize ?? 35;
  const maxBatches = opts?.maxBatches ?? 8;
  const unique = Array.from(
    new Set(
      emails
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  );
  if (!unique.length) return [];

  const out: string[] = [];
  for (let i = 0; i < unique.length && out.length < maxBatches; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const or = batch.map((e) => `"${e.replace(/"/g, "")}"`).join(" OR ");
    out.push(`(from:(${or}) OR to:(${or}) OR cc:(${or}) OR deliveredto:(${or}))`);
  }
  return out;
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
