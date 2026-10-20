import { TelegramClient, sessions, Api, password as telegramPassword } from "telegram";
import bigInt from "big-integer";
import {
  decryptTelegramSession,
  encryptTelegramSession,
} from "@/lib/telegram/sessionCrypto";
import { envTelegramApiCreds, type TelegramApiCreds } from "@/lib/telegram/creds";

export function telegramApiConfigured() {
  return Boolean(envTelegramApiCreds());
}

export function telegramApiCreds(): TelegramApiCreds {
  const env = envTelegramApiCreds();
  if (!env) {
    throw new Error("Falta o app do Telegram (API ID e API HASH).");
  }
  return env;
}

export function normalizeTelegramPhone(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return `+${d}`;
}

export function mapTelegramError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e || "");
  const err = e as { errorMessage?: string; seconds?: number };
  const code = String(err?.errorMessage || msg);
  if (/PHONE_NUMBER_INVALID/i.test(code)) return "Número de telefone inválido.";
  if (/PHONE_CODE_INVALID/i.test(code)) return "Código inválido. Confira o app do Telegram.";
  if (/PHONE_CODE_EXPIRED/i.test(code)) return "Código expirado. Peça outro.";
  if (/SESSION_PASSWORD_NEEDED/i.test(code)) return "SESSION_PASSWORD_NEEDED";
  if (/PASSWORD_HASH_INVALID|PASSWORD_INVALID/i.test(code)) {
    return "Senha de duas etapas do Telegram incorreta.";
  }
  if (/FLOOD/i.test(code)) {
    const sec = Number(err?.seconds || 0);
    return sec > 0
      ? `Telegram pediu espera de ${sec}s. Tente de novo depois.`
      : "Telegram limitou tentativas. Espere um pouco.";
  }
  if (/API_ID_INVALID/i.test(code)) return "TELEGRAM_API_ID inválido.";
  if (/StringSession and StoreSessions/i.test(code)) {
    return "Não deu para abrir a sessão do Telegram. Envie o código de novo.";
  }
  if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/i.test(code)) {
    return "SESSION_DEAD";
  }
  return msg.slice(0, 280) || "Falha no Telegram.";
}

export function looksLikeIssuedContent(text: string) {
  return /parab[eé]ns|passagem foi emitida|resumo da emiss[aã]o|localizador/i.test(text);
}

export function looksLikeFlightContent(text: string) {
  const s = String(text || "");
  if (/latamairlines\.com|oferta-voos|combine suas milhas|milhas \+|light\b/i.test(s)) return true;
  if (/\borigem\b|\bdestino\b|\bcia\b|\bvoo\b/i.test(s) && /\b[A-Z]{3}\b/.test(s.toUpperCase())) {
    return true;
  }
  if (/\b[A-Z]{3}\s+[A-Z]{3}\b/.test(s.toUpperCase()) && /\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/.test(s)) {
    return true;
  }
  return false;
}

export function looksLikePassengerContent(text: string, _hasPhoto = false) {
  const s = String(text || "");
  if (looksLikeIssuedContent(s)) return false;
  if (/\bcpf\b|\bnasc|\bsobrenome\b|\bpassageir|\bnome completo\b|\bnome\b/i.test(s)) return true;
  if (/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(s)) return true;
  return looksLikeFlightContent(s);
}

function newClient(sessionStr: string, creds: TelegramApiCreds) {
  return new TelegramClient(
    new sessions.StringSession(sessionStr || ""),
    creds.apiId,
    creds.apiHash,
    {
    connectionRetries: 3,
    autoReconnect: false,
    timeout: 20,
    retryDelay: 1000,
  });
}

export async function withTelegramClient<T>(opts: {
  sessionEnc?: string | null;
  creds: TelegramApiCreds;
  run: (client: TelegramClient) => Promise<T>;
}): Promise<{ result: T; sessionEnc: string }> {
  let sessionStr = "";
  if (opts.sessionEnc) {
    try {
      sessionStr = decryptTelegramSession(opts.sessionEnc);
    } catch {
      sessionStr = "";
    }
  }
  const client = newClient(sessionStr, opts.creds);
  try {
    await client.connect();
    const result = await opts.run(client);
    const saveSession = client.session.save.bind(client.session) as () => unknown;
    const raw = saveSession();
    const saved = typeof raw === "string" ? raw : "";
    return { result, sessionEnc: saved ? encryptTelegramSession(saved) : opts.sessionEnc || "" };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

export async function sendTelegramLoginCode(
  phone: string,
  sessionEnc: string | null | undefined,
  creds: TelegramApiCreds
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const sent = await client.sendCode(
        { apiId: creds.apiId, apiHash: creds.apiHash },
        phone,
        false
      );
      return { phoneCodeHash: String(sent.phoneCodeHash || "") };
    },
  });
}

export async function signInTelegram(opts: {
  phone: string;
  phoneCodeHash: string;
  code: string;
  sessionEnc?: string | null;
  creds: TelegramApiCreds;
}) {
  try {
    return await withTelegramClient({
      sessionEnc: opts.sessionEnc,
      creds: opts.creds,
      run: async (client) => {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: opts.phone,
            phoneCodeHash: opts.phoneCodeHash,
            phoneCode: opts.code.trim(),
          })
        );
        const me = (await client.getMe()) as { id?: unknown; firstName?: string; lastName?: string };
        return {
          telegramUserId: String(me?.id || ""),
          telegramName: [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim(),
        };
      },
    });
  } catch (e) {
    const mapped = mapTelegramError(e);
    if (mapped === "SESSION_PASSWORD_NEEDED") {
      const sessionEnc = (e as { sessionEnc?: string }).sessionEnc;
      void sessionEnc;
      throw Object.assign(new Error("SESSION_PASSWORD_NEEDED"), { needPassword: true as const });
    }
    throw new Error(mapped);
  }
}

export async function signInTelegramPassword(opts: {
  password: string;
  sessionEnc?: string | null;
  creds: TelegramApiCreds;
}) {
  return withTelegramClient({
    sessionEnc: opts.sessionEnc,
    creds: opts.creds,
    run: async (client) => {
      const pwd = await client.invoke(new Api.account.GetPassword());
      await client.invoke(
        new Api.auth.CheckPassword({
          password: await telegramPassword.computeCheck(pwd, opts.password),
        })
      );
      const me = (await client.getMe()) as { id?: unknown; firstName?: string; lastName?: string };
      return {
        telegramUserId: String(me?.id || ""),
        telegramName: [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim(),
      };
    },
  });
}

export type TelegramChatRow = {
  id: string;
  title: string;
  lastMessage: string;
};

export async function listTelegramChats(
  sessionEnc: string,
  query: string,
  creds: TelegramApiCreds
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const dialogs = await client.getDialogs({ limit: 60 });
      const q = query.trim().toLowerCase();
      const rows: TelegramChatRow[] = [];
      for (const d of dialogs) {
        const title = String((d as { title?: string; name?: string }).title || (d as { name?: string }).name || "").trim();
        const entity = (d as { entity?: { id?: unknown } }).entity;
        const id = String(entity?.id || (d as { id?: unknown }).id || "");
        if (!id) continue;
        const msg = d.message as { message?: string } | undefined;
        const lastMessage = String(msg?.message || "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (q && !title.toLowerCase().includes(q) && !lastMessage.toLowerCase().includes(q)) {
          continue;
        }
        rows.push({ id, title: title || "Conversa", lastMessage });
      }
      return rows.slice(0, 40);
    },
  });
}

async function resolveChatEntity(client: TelegramClient, chatId: string) {
  try {
    return await client.getEntity(chatId);
  } catch {
    const n = Number(chatId);
    if (Number.isSafeInteger(n) && n !== 0) {
      return await client.getEntity(n);
    }
    return await client.getEntity(bigInt(chatId));
  }
}

export type TelegramMessageRow = {
  id: number;
  date: string | null;
  text: string;
  hasPhoto: boolean;
  looksPassenger: boolean;
  looksFlight: boolean;
  looksIssued: boolean;
  fromYou: boolean;
  sender: string;
  thumb: string | null;
};

function previewMessage(m: {
  id?: number;
  date?: Date | number;
  message?: string;
  photo?: unknown;
  document?: { mimeType?: string };
  out?: boolean;
  sender?: { firstName?: string; lastName?: string };
}): TelegramMessageRow {
  const text = String(m.message || "").trim();
  const mime = String(m.document?.mimeType || "");
  const hasPhoto = Boolean(m.photo) || /^image\//i.test(mime);
  const dateRaw = m.date;
  const date =
    dateRaw instanceof Date
      ? dateRaw.toISOString()
      : typeof dateRaw === "number"
        ? new Date(dateRaw * 1000).toISOString()
        : null;
  const fromYou = Boolean(m.out);
  const sender = fromYou
    ? "Você"
    : [m.sender?.firstName, m.sender?.lastName].filter(Boolean).join(" ").trim() || "Contato";
  return {
    id: Number(m.id || 0),
    date,
    text: text.slice(0, 500),
    hasPhoto,
    looksPassenger: looksLikePassengerContent(text),
    looksFlight: looksLikeFlightContent(text) || (hasPhoto && !looksLikeIssuedContent(text)),
    looksIssued: looksLikeIssuedContent(text),
    fromYou,
    sender,
    thumb: null,
  };
}

function bufferToJpegDataUrl(buf: unknown) {
  const raw = Buffer.isBuffer(buf)
    ? buf
    : typeof buf === "string"
      ? Buffer.from(buf, "binary")
      : null;
  if (!raw || raw.length < 40 || raw.length > 550_000) return null;
  return `data:image/jpeg;base64,${raw.toString("base64")}`;
}

export async function checkTelegramAlive(sessionEnc: string, creds: TelegramApiCreds) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => client.checkAuthorization(),
  });
}

export async function listTelegramMessages(
  sessionEnc: string,
  chatId: string,
  creds: TelegramApiCreds
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const entity = await resolveChatEntity(client, chatId);
      const messages = await client.getMessages(entity, { limit: 36 });
      const rows: TelegramMessageRow[] = [];
      let thumbs = 0;
      for (const m of messages) {
        const row = previewMessage(m as never);
        if (row.id <= 0) continue;
        if (row.hasPhoto && thumbs < 20) {
          try {
            const buf = await client.downloadMedia(m, { thumb: 1 });
            row.thumb = bufferToJpegDataUrl(buf);
            if (row.thumb) thumbs += 1;
          } catch {
            row.thumb = null;
          }
        }
        rows.push(row);
      }
      return rows;
    },
  });
}

export async function readTelegramMessages(
  sessionEnc: string,
  chatId: string,
  messageIds: number[] | undefined,
  creds: TelegramApiCreds
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const entity = await resolveChatEntity(client, chatId);
      const wanted = (messageIds || []).map((n) => Math.trunc(Number(n))).filter((n) => n > 0);
      const messages = wanted.length
        ? await client.getMessages(entity, { ids: wanted })
        : await client.getMessages(entity, { limit: 12 });
      const texts: string[] = [];
      const images: { mimeType: string; base64: string }[] = [];
      const chronological = [...messages].reverse();
      for (const m of chronological) {
        const row = m as {
          message?: string;
          photo?: unknown;
          document?: { mimeType?: string };
        };
        const text = String(row.message || "").trim();
        if (text) texts.push(text);
        const mime = String(row.document?.mimeType || "");
        const hasMedia = Boolean(row.photo) || /^image\//i.test(mime);
        if (!hasMedia || images.length >= 8) continue;
        try {
          const buf = await client.downloadMedia(m, {});
          const raw = Buffer.isBuffer(buf)
            ? buf
            : typeof buf === "string"
              ? Buffer.from(buf, "binary")
              : null;
          if (!raw || raw.length < 80) continue;
          images.push({ mimeType: "image/jpeg", base64: raw.toString("base64") });
        } catch {
          /* mídia que não baixa */
        }
      }
      return { texts, images };
    },
  });
}
