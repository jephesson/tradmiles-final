import { TelegramClient, sessions, Api, password as telegramPassword } from "telegram";
import bigInt from "big-integer";
import {
  decryptTelegramSession,
  encryptTelegramSession,
} from "@/lib/telegram/sessionCrypto";
import { envTelegramApiCreds, type TelegramApiCreds } from "@/lib/telegram/creds";
import {
  bufferToDocumentText,
  documentFileName,
  fileKindLabel,
  isPdfDocument,
  isTextishDocument,
  webpageToText,
} from "./mediaText";

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
  if (/Could not find the input entity|No user has/i.test(msg)) {
    return "Não abri essa conversa. Volte à lista e escolha de novo.";
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
  lastDate: number;
  accessHash: string;
};

export type TelegramChatCursor = {
  offsetDate: number;
  offsetId: number;
  offsetPeer: string;
};

export const TELEGRAM_CHAT_PAGE = 10;

function dialogUnix(d: { date?: unknown }) {
  const date = d.date;
  if (typeof date === "number") return date > 1e12 ? Math.floor(date / 1000) : date;
  if (date instanceof Date) return Math.floor(date.getTime() / 1000);
  return 0;
}

function entityClass(entity: unknown) {
  if (!entity || typeof entity !== "object") return "";
  return String((entity as { className?: string }).className || "");
}

function isPrivatePerson(d: unknown) {
  if (!d || typeof d !== "object") return false;
  const row = d as {
    isUser?: boolean;
    isGroup?: boolean;
    isChannel?: boolean;
    entity?: {
      className?: string;
      deleted?: boolean;
      megagroup?: boolean;
      broadcast?: boolean;
    };
  };
  if (row.entity?.deleted) return false;
  if (row.isGroup === true || row.entity?.megagroup) return false;
  if (row.isChannel === true || row.entity?.broadcast) return false;
  const cls = entityClass(row.entity);
  if (cls === "Chat" || cls === "ChatForbidden" || cls === "Channel" || cls === "ChannelForbidden") {
    return false;
  }
  if (row.isUser === true || cls === "User" || cls === "UserEmpty") return true;
  return cls === "" && row.isUser !== false && !row.isGroup && !row.isChannel;
}

function dialogTitle(d: unknown) {
  const row = d as { title?: string; name?: string };
  return String(row.title || row.name || "").trim();
}

function dialogPeerId(d: unknown) {
  const row = d as { entity?: { id?: unknown }; id?: unknown };
  return String(row.entity?.id || row.id || "");
}

function dialogAccessHash(d: unknown) {
  const hash = (d as { entity?: { accessHash?: unknown } }).entity?.accessHash;
  if (hash == null || hash === "") return "";
  return String(hash);
}

function cursorFromDialog(d: {
  date?: unknown;
  message?: { id?: number };
  entity?: { id?: unknown };
  id?: unknown;
}): TelegramChatCursor {
  return {
    offsetDate: dialogUnix(d),
    offsetId: Number(d.message?.id || 0),
    offsetPeer: String(d.entity?.id || d.id || ""),
  };
}

export async function listTelegramChats(
  sessionEnc: string,
  query: string,
  creds: TelegramApiCreds,
  cursor?: TelegramChatCursor | null
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const q = query.trim().toLowerCase();
      const page = TELEGRAM_CHAT_PAGE;
      const scan = q ? 80 : 50;
      const people: TelegramChatRow[] = [];
      const others: TelegramChatRow[] = [];
      let peopleCursor: TelegramChatCursor | null = null;
      let othersCursor: TelegramChatCursor | null = null;

      // ignoreMigrated no gramjs está invertido e some com User — não usar.
      const dialogs = await client.getDialogs({
        limit: scan,
        ...(cursor?.offsetDate ? { offsetDate: cursor.offsetDate } : {}),
        ...(cursor?.offsetId ? { offsetId: cursor.offsetId } : {}),
      });

      for (const d of dialogs) {
        const title = dialogTitle(d);
        const id = dialogPeerId(d);
        if (!id) continue;
        const msg = d.message as { message?: string } | undefined;
        const lastMessage = String(msg?.message || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        if (q && !title.toLowerCase().includes(q) && !lastMessage.toLowerCase().includes(q)) {
          continue;
        }
        const row = {
          id,
          title: title || "Conversa",
          lastMessage,
          lastDate: dialogUnix(d),
          accessHash: dialogAccessHash(d),
        };
        const cur = cursorFromDialog(d);
        if (isPrivatePerson(d)) {
          if (people.length < page) {
            people.push(row);
            peopleCursor = cur;
          }
        } else if (others.length < page) {
          others.push(row);
          othersCursor = cur;
        }
        if (people.length >= page) break;
      }

      const chats = people.length ? people : others;
      const next = people.length ? peopleCursor : othersCursor;
      const exhausted = dialogs.length < scan;
      return {
        chats,
        next: exhausted && chats.length < page ? null : next,
      };
    },
  });
}

async function resolveChatEntity(
  client: TelegramClient,
  chatId: string,
  accessHash?: string
) {
  const raw = String(chatId || "").trim();
  const hash = String(accessHash || "").trim();

  if (hash && hash !== "0") {
    try {
      if (raw.startsWith("-100")) {
        return await client.getInputEntity(
          new Api.InputPeerChannel({
            channelId: bigInt(raw.slice(4)),
            accessHash: bigInt(hash),
          })
        );
      }
      if (raw.startsWith("-")) {
        return await client.getInputEntity(
          new Api.InputPeerChat({ chatId: bigInt(raw.replace(/^-/, "")) })
        );
      }
      return await client.getInputEntity(
        new Api.InputPeerUser({
          userId: bigInt(raw),
          accessHash: bigInt(hash),
        })
      );
    } catch {
      /* tenta os fallbacks */
    }
  }

  for (const key of [raw, Number.isSafeInteger(Number(raw)) ? Number(raw) : null, bigInt(raw)]) {
    if (key === null || key === "") continue;
    try {
      return await client.getInputEntity(key as never);
    } catch {
      /* próximo */
    }
  }

  const dialogs = await client.getDialogs({ limit: 80 });
  const found = dialogs.find((d) => dialogPeerId(d) === raw);
  if (found?.entity) return found.entity;

  throw new Error("Não abri essa conversa. Volte à lista e escolha de novo.");
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
  fileLabel: string | null;
};

type TelegramRawMessage = {
  id?: number;
  date?: Date | number;
  message?: string;
  photo?: unknown;
  document?: { mimeType?: string; attributes?: Array<{ fileName?: string }> };
  file?: { name?: string; mimeType?: string };
  webPreview?: {
    title?: string;
    description?: string;
    siteName?: string;
    cachedPage?: { blocks?: unknown[] };
  };
  media?: { webpage?: unknown; className?: string };
  out?: boolean;
  sender?: { firstName?: string; lastName?: string };
};

function captionAndPreviewText(m: TelegramRawMessage) {
  const caption = String(m.message || "").trim();
  const web =
    m.webPreview ||
    (m.media && typeof m.media === "object" && "webpage" in m.media
      ? (m.media as { webpage?: TelegramRawMessage["webPreview"] }).webpage
      : null);
  const webText = webpageToText(web || undefined);
  return [caption, webText].filter(Boolean).join("\n").trim();
}

function isConcreteTelegramMessage(m: unknown): m is TelegramRawMessage {
  if (!m || typeof m !== "object") return false;
  return Number((m as { id?: unknown }).id || 0) > 0;
}

function sniffImageMime(raw: Buffer): string | null {
  if (raw.length < 12) return null;
  if (raw[0] === 0xff && raw[1] === 0xd8) return "image/jpeg";
  if (raw[0] === 0x89 && raw[1] === 0x50) return "image/png";
  if (raw[0] === 0x47 && raw[1] === 0x49) return "image/gif";
  if (raw.slice(0, 4).toString("ascii") === "RIFF" && raw.slice(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function isImageMessage(m: TelegramRawMessage): boolean {
  if (m.photo) return true;
  const mime = String(m.document?.mimeType || m.file?.mimeType || "");
  const fileName = documentFileName(m.document, m.file);
  if (isPdfDocument(mime, fileName) || isTextishDocument(mime, fileName)) return false;
  if (/^image\//i.test(mime)) return true;
  if (/\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(fileName)) return true;
  const cls = String(m.media?.className || "");
  if (/MessageMediaPhoto/i.test(cls)) return true;
  if (/MessageMediaDocument/i.test(cls) && /\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(fileName)) {
    return true;
  }
  if (m.document && (!mime || /octet-stream/i.test(mime))) {
    return /\.(jpe?g|png|webp|gif|heic|bmp)$/i.test(fileName) || !fileName;
  }
  return false;
}

async function fetchSelectedMessages(
  client: TelegramClient,
  entity: unknown,
  wanted: number[]
) {
  const wantedSet = new Set(wanted);
  const pick = (rows: unknown[]) =>
    (rows || []).filter(
      (m): m is TelegramRawMessage =>
        isConcreteTelegramMessage(m) && wantedSet.has(Number((m as { id?: number }).id))
    );

  // getMessages({ ids }) no privado costuma vir MessageEmpty. A lista já veio do histórico.
  const recent = await client.getMessages(entity as never, { limit: 80 });
  let found = pick(recent as unknown[]);
  if (found.length >= wanted.length) return found;

  const merge = (extra: TelegramRawMessage[]) => {
    const have = new Set(found.map((m) => Number(m.id)));
    for (const m of extra) {
      const id = Number(m.id);
      if (!have.has(id)) {
        found.push(m);
        have.add(id);
      }
    }
  };

  try {
    const byIds = await client.getMessages(entity as never, {
      ids: wanted.map((id) => new Api.InputMessageID({ id })),
    });
    merge(pick(byIds as unknown[]));
  } catch {
    try {
      const byIds = await client.getMessages(entity as never, { ids: wanted });
      merge(pick(byIds as unknown[]));
    } catch {
      /* ids vazios */
    }
  }
  return found;
}

function previewMessage(m: TelegramRawMessage): TelegramMessageRow {
  const text = captionAndPreviewText(m);
  const mime = String(m.document?.mimeType || m.file?.mimeType || "");
  const fileName = documentFileName(m.document, m.file);
  const hasPhoto = isImageMessage(m);
  const hasFile = Boolean(m.document) && !hasPhoto;
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
    text: text.slice(0, 2000),
    hasPhoto,
    looksPassenger: looksLikePassengerContent(text),
    looksFlight: looksLikeFlightContent(text) || (hasPhoto && !looksLikeIssuedContent(text)),
    looksIssued: looksLikeIssuedContent(text),
    fromYou,
    sender,
    thumb: null,
    fileLabel: hasFile ? fileKindLabel(mime, fileName) : webTextLabel(m, text),
  };
}

function webTextLabel(m: TelegramRawMessage, text: string) {
  if (m.webPreview || String(m.media?.className || "").includes("WebPage")) {
    return text ? null : "Prévia / tabela";
  }
  return null;
}

async function fillFromDocument(
  client: TelegramClient,
  m: unknown,
  row: TelegramMessageRow
) {
  const raw = m as TelegramRawMessage;
  const mime = String(raw.document?.mimeType || raw.file?.mimeType || "");
  const fileName = documentFileName(raw.document, raw.file);
  if (!raw.document) return;
  const textish = isTextishDocument(mime, fileName);
  const pdf = isPdfDocument(mime, fileName);
  if (!textish && !pdf) return;
  try {
    const buf = await client.downloadMedia(m as never, {});
    const data = Buffer.isBuffer(buf)
      ? buf
      : typeof buf === "string"
        ? Buffer.from(buf, "binary")
        : null;
    if (!data || data.length < 20) return;
    let extracted = "";
    if (pdf) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(data));
      const got = await extractText(doc, { mergePages: true });
      extracted = Array.isArray(got.text) ? got.text.join("\n") : String(got.text || "");
    } else {
      extracted = bufferToDocumentText(data, mime, fileName);
    }
    extracted = extracted.trim();
    if (!extracted) return;
    row.text = [row.text, extracted].filter(Boolean).join("\n").slice(0, 8000);
    row.looksPassenger = looksLikePassengerContent(row.text);
    row.looksFlight = looksLikeFlightContent(row.text);
    row.looksIssued = looksLikeIssuedContent(row.text);
    if (!row.fileLabel) row.fileLabel = fileKindLabel(mime, fileName);
  } catch {
    /* arquivo que não baixa */
  }
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
  creds: TelegramApiCreds,
  accessHash?: string
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const entity = await resolveChatEntity(client, chatId, accessHash);
      const messages = await client.getMessages(entity, { limit: 36 });
      const rows: TelegramMessageRow[] = [];
      let thumbs = 0;
      let files = 0;
      for (const m of messages) {
        if (!isConcreteTelegramMessage(m)) continue;
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
        if (files < 12 && (!row.text || row.fileLabel)) {
          const before = row.text;
          await fillFromDocument(client, m, row);
          if (row.text !== before) files += 1;
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
  creds: TelegramApiCreds,
  accessHash?: string
) {
  return withTelegramClient({
    sessionEnc,
    creds,
    run: async (client) => {
      const entity = await resolveChatEntity(client, chatId, accessHash);
      const wanted = (messageIds || []).map((n) => Math.trunc(Number(n))).filter((n) => n > 0);
      const messages = wanted.length
        ? await fetchSelectedMessages(client, entity, wanted)
        : ((await client.getMessages(entity, { limit: 12 })) as unknown[]).filter(
            isConcreteTelegramMessage
          );
      const texts: string[] = [];
      const images: { mimeType: string; base64: string }[] = [];
      const chronological = [...messages].reverse();
      for (const m of chronological) {
        if (!isConcreteTelegramMessage(m)) continue;
        const preview = previewMessage(m);
        await fillFromDocument(client, m, preview);
        if (preview.text) texts.push(preview.text);
        if (!isImageMessage(m) || images.length >= 8) continue;
        try {
          const buf = await client.downloadMedia(m as never, {});
          const raw = Buffer.isBuffer(buf)
            ? buf
            : typeof buf === "string"
              ? Buffer.from(buf, "binary")
              : null;
          if (!raw || raw.length < 80) continue;
          const declared = String(m.document?.mimeType || m.file?.mimeType || "");
          const mime =
            sniffImageMime(raw) ||
            (/^image\//i.test(declared) ? declared : "") ||
            (m.photo ? "image/jpeg" : "");
          if (!mime) continue;
          images.push({ mimeType: mime, base64: raw.toString("base64") });
        } catch {
          /* mídia que não baixa */
        }
      }
      return { texts, images };
    },
  });
}
